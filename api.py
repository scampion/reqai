#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import http.server
import socketserver
import json
import os
from urllib.parse import urlparse, parse_qs
import re
import threading # For locking file access
from http import HTTPStatus # Use standard HTTP status codes
from datetime import datetime # For timestamp in filename
import time # For timezone info (though datetime handles it better)

# --- Configuration ---
HOST = "localhost"
PORT = 8000
DATA_FILE = "requirements_data.json"
API_PREFIX = "/api/entities"
# Define timezone for export filename (Standard library might lack full DB, use UTC or known local offset)
# Let's try to get local offset if possible, otherwise default to UTC concept
# try:
#     # Standard library approach for local timezone name (can be unreliable)
#     LOCAL_TIMEZONE_NAME = time.tzname[time.localtime().tm_isdst]
#     # For demonstration, explicitly using Brussels time via fixed offset if name lookup fails
#     # WARNING: Standard library fixed offsets don't handle DST changes automatically like pytz would.
#     # CET is UTC+1, CEST is UTC+2. March 31st is CEST.
#     EXPORT_TIMEZONE = datetime.timezone(datetime.timedelta(hours=2), name="Europe/Brussels_Approximation") # CEST approx
#     print(f"Attempting to use timezone offset: {EXPORT_TIMEZONE}")
# except Exception:
#     print("Warning: Could not reliably determine local timezone. Defaulting export timestamp timezone to UTC.")
#    EXPORT_TIMEZONE = datetime.timezone.utc


# --- Thread-safe Data Handling (Unchanged) ---
data_lock = threading.Lock()

def load_data():
    # ... (keep existing load_data function) ...
    with data_lock:
        if os.path.exists(DATA_FILE):
            try:
                with open(DATA_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError) as e:
                print(f"Error loading data from {DATA_FILE}: {e}. Returning empty structure.")
                return {
                    "stakeholders": [], "goals_and_objectives": [], "business_processes": [],
                    "requirements": [], "systems_and_applications": [], "data_entities": [],
                    "risks_and_constraints": [], "metrics_and_kpis": []
                }
        else:
            print(f"Warning: {DATA_FILE} not found. Returning empty structure.")
            return {
                "stakeholders": [], "goals_and_objectives": [], "business_processes": [],
                "requirements": [], "systems_and_applications": [], "data_entities": [],
                "risks_and_constraints": [], "metrics_and_kpis": []
            }

def save_data(data_to_save):
    # ... (keep existing save_data function) ...
    with data_lock:
        try:
            with open(DATA_FILE, 'w', encoding='utf-8') as f:
                json.dump(data_to_save, f, indent=2, ensure_ascii=False)
            return True
        except IOError as e:
            print(f"Error saving data to {DATA_FILE}: {e}")
            return False
        except Exception as e:
            print(f"An unexpected error occurred during saving: {e}")
            return False

# --- ID Generation (Unchanged) ---
def generate_next_id(entity_type_key, current_data):
    # ... (keep existing generate_next_id function) ...
    if entity_type_key not in current_data or not current_data[entity_type_key]:
        prefix_map = {
            "stakeholders": "STK", "goals_and_objectives": "GOAL", "business_processes": "BP",
            "requirements": "REQ", "systems_and_applications": "SYS", "data_entities": "DE",
            "risks_and_constraints": "RISK", "metrics_and_kpis": "KPI"
        }
        prefix = prefix_map.get(entity_type_key, entity_type_key[:3].upper())
        return f"{prefix}001"
    max_num = 0
    prefix = ""
    id_pattern = re.compile(r"([a-zA-Z]+)(\d+)")
    for item in current_data[entity_type_key]:
        item_id = item.get("id", "")
        match = id_pattern.match(item_id)
        if match:
            current_prefix = match.group(1)
            current_num = int(match.group(2))
            if not prefix: prefix = current_prefix
            if current_prefix == prefix: max_num = max(max_num, current_num)
        elif not prefix and item_id: prefix = ''.join(filter(str.isalpha, item_id)) or entity_type_key[:3].upper()
    if not prefix:
        prefix_map = {"stakeholders": "STK", "goals_and_objectives": "GOAL", "business_processes": "BP", "requirements": "REQ", "systems_and_applications": "SYS", "data_entities": "DE", "risks_and_constraints": "RISK", "metrics_and_kpis": "KPI"}
        prefix = prefix_map.get(entity_type_key, entity_type_key[:3].upper())
    next_num = max_num + 1
    return f"{prefix}{next_num:03d}"


# --- NEW: RTF Generation Logic ---
def escape_rtf(text):
    """Escapes characters special to RTF."""
    if text is None:
        return ""
    text = str(text)
    # Escape backslashes, curly braces first
    text = text.replace('\\', '\\\\')
    text = text.replace('{', '\\{')
    text = text.replace('}', '\\}')
    # Convert unicode characters outside basic range to \uXXXX? format
    # This is a simplified approach; full unicode support is complex in RTF
    encoded = []
    for char in text:
        codepoint = ord(char)
        if codepoint < 128: # Basic ASCII
             encoded.append(char)
        else:
             # Use \uXXXX? format for RTF
             # The '?' is a placeholder for characters not representable in the target codepage
             encoded.append(f'\\u{codepoint}?')
    return "".join(encoded)

def generate_rtf_recursive(data, indent_level=0):
    """Recursively generates RTF fragment for JSON data."""
    rtf_str = ""
    indent = '\\li' + str(indent_level * 720) + '\\fi-' + str(indent_level * 720) + ' ' # 720 twips = 0.5 inch approx

    if isinstance(data, dict):
        for key, value in data.items():
            rtf_str += f"\\pard {indent} \\b {escape_rtf(key)}:\\b0 " # Bold key
            if isinstance(value, (dict, list)):
                rtf_str += "\\par\n" # Newline before nested structure
                rtf_str += generate_rtf_recursive(value, indent_level + 1)
            else:
                 # Add value on the same line after a tab, if simple
                 rtf_str += f"\\tab {escape_rtf(value)}\\par\n" # Value and paragraph end
    elif isinstance(data, list):
        for index, item in enumerate(data):
             # Add a bullet point or index before the item
             rtf_str += f"\\pard {indent} \\bullet Item {index + 1}:\\par\n"
             # Increase indent for item content
             rtf_str += generate_rtf_recursive(item, indent_level + 1)
             rtf_str += "\\par\n" # Extra space between list items
    else:
        # Should not happen if top level is dict, but handle just in case
        rtf_str += f"\\pard {indent} {escape_rtf(data)}\\par\n"

    return rtf_str

def generate_rtf(data):
    """Generates a complete RTF document string from the data."""
    # RTF Header
    header = "{\\rtf1\\ansi\\deff0\\nouicompat"
    header += "{\\fonttbl{\\f0 Arial;}{\\f1 Courier New;}}" # Font table: f0=Arial, f1=Courier
    # Basic Color Table (optional) - Black, Red, Green, Blue
    # header += "{\\colortbl ;\\red0\\green0\\blue0;\\red255\\green0\\blue0;\\red0\\green255\\blue0;\\red0\\green0\\blue255;}"
    header += "\\pard\\sa200\\sl276\\slmult1\\f0\\fs24\n" # Default paragraph, font 0 (Arial), size 12pt (24 half-points)

    # RTF Body generated recursively
    body = generate_rtf_recursive(data)

    # RTF Footer
    footer = "\n}"

    return header + body + footer

# --- Request Handler Class (Modifications) ---
class APIRequestHandler(http.server.BaseHTTPRequestHandler):

    # --- CORS Headers (Unchanged) ---
    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_cors_headers()
        self.end_headers()

    # --- Response Helpers (Unchanged) ---
    def send_json_response(self, data, status_code=HTTPStatus.OK):
        # ... (keep existing send_json_response function) ...
        self.send_response(status_code)
        self.send_cors_headers()
        self.send_header("Content-type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def send_error_response(self, message, status_code=HTTPStatus.BAD_REQUEST):
        # ... (keep existing send_error_response function) ...
        error_data = {"error": message}
        self.send_json_response(error_data, status_code)

    def send_no_content_response(self):
        # ... (keep existing send_no_content_response function) ...
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_cors_headers()
        self.end_headers()

    # --- NEW: Send File Response ---
    def send_file_response(self, data_bytes, status_code=HTTPStatus.OK, content_type="application/octet-stream", filename=None):
        """Sends a response containing file data."""
        self.send_response(status_code)
        self.send_cors_headers() # Include CORS for consistency, though download might bypass some checks
        self.send_header("Content-type", content_type)
        self.send_header("Content-Length", str(len(data_bytes)))
        if filename:
            # Use Content-Disposition to suggest filename to browser
            # Ensure filename is ASCII or properly encoded (simple ASCII for now)
            safe_filename = "".join(c for c in filename if c.isalnum() or c in ['.', '_', '-']).strip()
            if not safe_filename: safe_filename = "download.dat"
            self.send_header("Content-Disposition", f'attachment; filename="{safe_filename}"')
        self.end_headers()
        self.wfile.write(data_bytes)

    # --- Request Body Parsing (Unchanged) ---
    def parse_json_body(self):
        # ... (keep existing parse_json_body function) ...
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0: return None
            body = self.rfile.read(content_length)
            return json.loads(body.decode('utf-8'))
        except (TypeError, ValueError, json.JSONDecodeError) as e:
            raise ValueError(f"Invalid JSON received: {e}") from e

    # --- GET Handler (MODIFIED) ---
    def do_GET(self):
        """Handles GET requests for listing, retrieving, exporting, and serving frontend."""
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        path_parts = path.strip('/').split('/')

        # --- NEW: Endpoint: /api/export/rtf ---
        if path == "/api/export/rtf":
            try:
                current_data = load_data()
                rtf_content = generate_rtf(current_data)
                rtf_bytes = rtf_content.encode('ascii', errors='ignore') # Encode as basic ASCII/ANSI for RTF

                # Generate filename with timestamp
                now = datetime.now()
                timestamp = now.strftime("%Y%m%d_%H%M%S")
                filename = f"requirements_export_{timestamp}.rtf"

                self.send_file_response(rtf_bytes, content_type="application/rtf", filename=filename)

            except Exception as e:
                print(f"Error generating RTF export: {e}")
                self.send_error_response("Failed to generate RTF export.", HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        # --- End of NEW Endpoint ---

        # Endpoint: /api/entity_types (List all types)
        if path == "/api/entity_types":
             current_data = load_data()
             entity_types = list(current_data.keys())
             self.send_json_response(entity_types)
             return

        # Endpoint: /api/entities/{entity_type} (List items of a type)
        # Endpoint: /api/entities/{entity_type}/{item_id} (Get specific item)
        # Allow optional query param like ?limit=1
        query_params = parse_qs(parsed_path.query)
        limit = query_params.get('limit', [None])[0]

        if len(path_parts) >= 3 and path_parts[0] == "api" and path_parts[1] == "entities":
            entity_type = path_parts[2]
            current_data = load_data()

            if entity_type not in current_data:
                self.send_error_response(f"Entity type '{entity_type}' not found.", HTTPStatus.NOT_FOUND)
                return

            # Get specific item
            if len(path_parts) == 4:
                item_id = path_parts[3]
                item = next((item for item in current_data[entity_type] if item.get("id") == item_id), None)
                if item:
                    self.send_json_response(item)
                else:
                    self.send_error_response(f"Item with ID '{item_id}' not found in '{entity_type}'.", HTTPStatus.NOT_FOUND)
            # List items for the type (with optional limit)
            elif len(path_parts) == 3:
                items_to_send = current_data[entity_type]
                if limit:
                    try:
                        items_to_send = items_to_send[:int(limit)]
                    except (ValueError, TypeError):
                        pass # Ignore invalid limit
                self.send_json_response(items_to_send)
            else:
                 self.send_error_response("Invalid API path.", HTTPStatus.BAD_REQUEST)
            return

        # Serve frontend files
        if path == "/" or path == "/index.html":
             self.serve_static_file("index.html", "text/html; charset=utf-8")
        elif path == "/app.js":
             self.serve_static_file("app.js", "application/javascript; charset=utf-8")
        else:
            # Default 404 for other paths
            self.send_error_response("API Endpoint or File not found.", HTTPStatus.NOT_FOUND)

    # --- POST, PUT, DELETE Handlers (Unchanged) ---
    def do_POST(self):
        # ... (keep existing do_POST function) ...
        parsed_path = urlparse(self.path)
        path_parts = parsed_path.path.strip('/').split('/')
        if len(path_parts) == 3 and path_parts[0] == "api" and path_parts[1] == "entities":
            entity_type = path_parts[2]
            current_data = load_data()
            if entity_type not in current_data: self.send_error_response(f"Entity type '{entity_type}' not found.", HTTPStatus.NOT_FOUND); return
            try:
                new_item_data = self.parse_json_body()
                if not new_item_data or not isinstance(new_item_data, dict): raise ValueError("Invalid or empty JSON data received for new item.")
                new_id = generate_next_id(entity_type, current_data)
                new_item_data['id'] = new_id
                current_data[entity_type].append(new_item_data)
                if save_data(current_data): self.send_json_response(new_item_data, HTTPStatus.CREATED)
                else: self.send_error_response("Failed to save data.", HTTPStatus.INTERNAL_SERVER_ERROR)
            except ValueError as e: self.send_error_response(str(e), HTTPStatus.BAD_REQUEST)
            except Exception as e: print(f"Unexpected error in POST: {e}"); self.send_error_response("An internal server error occurred.", HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        self.send_error_response("Invalid API endpoint for POST.", HTTPStatus.METHOD_NOT_ALLOWED)

    def do_PUT(self):
        # ... (keep existing do_PUT function) ...
        parsed_path = urlparse(self.path)
        path_parts = parsed_path.path.strip('/').split('/')
        if len(path_parts) == 4 and path_parts[0] == "api" and path_parts[1] == "entities":
            entity_type = path_parts[2]; item_id = path_parts[3]; current_data = load_data()
            if entity_type not in current_data: self.send_error_response(f"Entity type '{entity_type}' not found.", HTTPStatus.NOT_FOUND); return
            item_index = next((i for i, item in enumerate(current_data[entity_type]) if item.get("id") == item_id), -1)
            if item_index == -1: self.send_error_response(f"Item with ID '{item_id}' not found in '{entity_type}'.", HTTPStatus.NOT_FOUND); return
            try:
                update_data = self.parse_json_body()
                if not update_data or not isinstance(update_data, dict): raise ValueError("Invalid or empty JSON data received for update.")
                original_item = current_data[entity_type][item_index]; original_item.update(update_data); original_item['id'] = item_id
                current_data[entity_type][item_index] = original_item
                if save_data(current_data): self.send_json_response(original_item, HTTPStatus.OK)
                else: self.send_error_response("Failed to save updated data.", HTTPStatus.INTERNAL_SERVER_ERROR)
            except ValueError as e: self.send_error_response(str(e), HTTPStatus.BAD_REQUEST)
            except Exception as e: print(f"Unexpected error in PUT: {e}"); self.send_error_response("An internal server error occurred.", HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        self.send_error_response("Invalid API endpoint for PUT.", HTTPStatus.METHOD_NOT_ALLOWED)

    def do_DELETE(self):
        # ... (keep existing do_DELETE function) ...
        parsed_path = urlparse(self.path)
        path_parts = parsed_path.path.strip('/').split('/')
        if len(path_parts) == 4 and path_parts[0] == "api" and path_parts[1] == "entities":
            entity_type = path_parts[2]; item_id = path_parts[3]; current_data = load_data()
            if entity_type not in current_data: self.send_error_response(f"Entity type '{entity_type}' not found.", HTTPStatus.NOT_FOUND); return
            initial_len = len(current_data[entity_type])
            current_data[entity_type] = [item for item in current_data[entity_type] if item.get("id") != item_id]
            if len(current_data[entity_type]) < initial_len:
                if save_data(current_data): self.send_no_content_response()
                else: self.send_error_response("Failed to save data after deletion.", HTTPStatus.INTERNAL_SERVER_ERROR)
            else: self.send_error_response(f"Item with ID '{item_id}' not found in '{entity_type}' for deletion.", HTTPStatus.NOT_FOUND)
            return
        self.send_error_response("Invalid API endpoint for DELETE.", HTTPStatus.METHOD_NOT_ALLOWED)

    # --- Static File Serving (Unchanged) ---
    def serve_static_file(self, filename, content_type):
         # ... (keep existing serve_static_file function) ...
         try:
             filepath = os.path.join(os.path.dirname(__file__), filename)
             if os.path.exists(filepath):
                  with open(filepath, 'rb') as f:
                      self.send_response(HTTPStatus.OK)
                      self.send_header("Content-type", content_type)
                      fs = os.fstat(f.fileno())
                      self.send_header("Content-Length", str(fs.st_size))
                      # Ensure CORS headers are sent even for static files if needed, though less critical
                      # self.send_cors_headers() # Optional for static files
                      self.end_headers()
                      self.wfile.write(f.read())
             else:
                  self.send_error_response(f"{filename} not found.", HTTPStatus.NOT_FOUND)
         except Exception as e:
              print(f"Error serving static file {filename}: {e}")
              self.send_error_response("Error serving file.", HTTPStatus.INTERNAL_SERVER_ERROR)


# --- Main Execution (Unchanged) ---
if __name__ == "__main__":
    from socketserver import ThreadingMixIn
    class ThreadingHTTPServer(ThreadingMixIn, http.server.HTTPServer):
        pass
    load_data()
    print(f"Initial data loaded check complete. Using: {DATA_FILE}")
    httpd = ThreadingHTTPServer((HOST, PORT), APIRequestHandler)
    print(f"Serving API and Frontend on http://{HOST}:{PORT}")
    print("API endpoints available under /api/")
    print("RTF Export endpoint: /api/export/rtf")
    print("Frontend available at /")
    print("Press Ctrl+C to stop the server.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopping.")
        httpd.server_close()
