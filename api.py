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

# --- Configuration ---
HOST = "localhost"
PORT = 8000
DATA_FILE = "requirements_data.json"
API_PREFIX = "/api/entities"

# --- Thread-safe Data Handling ---
data_lock = threading.Lock() # To prevent race conditions when reading/writing file

def load_data():
    """Loads data from the JSON file (thread-safe)."""
    with data_lock:
        if os.path.exists(DATA_FILE):
            try:
                with open(DATA_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError) as e:
                print(f"Error loading data from {DATA_FILE}: {e}. Returning empty structure.")
                # Return a default structure if loading fails
                return {
                    "stakeholders": [], "goals_and_objectives": [], "business_processes": [],
                    "requirements": [], "systems_and_applications": [], "data_entities": [],
                    "risks_and_constraints": [], "metrics_and_kpis": []
                }
        else:
            print(f"Warning: {DATA_FILE} not found. Returning empty structure.")
            # Return a default structure if file doesn't exist
            return {
                "stakeholders": [], "goals_and_objectives": [], "business_processes": [],
                "requirements": [], "systems_and_applications": [], "data_entities": [],
                "risks_and_constraints": [], "metrics_and_kpis": []
            }

def save_data(data_to_save):
    """Saves the data dictionary to the JSON file (thread-safe)."""
    with data_lock:
        try:
            with open(DATA_FILE, 'w', encoding='utf-8') as f:
                json.dump(data_to_save, f, indent=2, ensure_ascii=False)
            return True # Indicate success
        except IOError as e:
            print(f"Error saving data to {DATA_FILE}: {e}")
            return False # Indicate failure
        except Exception as e:
            print(f"An unexpected error occurred during saving: {e}")
            return False # Indicate failure


# --- ID Generation (same as before) ---
def generate_next_id(entity_type_key, current_data):
    """Generates a new ID based on existing ones (e.g., STK003)."""
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
            if not prefix:
                prefix = current_prefix
            if current_prefix == prefix:
                max_num = max(max_num, current_num)
        elif not prefix and item_id:
             prefix = ''.join(filter(str.isalpha, item_id)) or entity_type_key[:3].upper()

    if not prefix: # Default prefix if none found
        prefix_map = {
            "stakeholders": "STK", "goals_and_objectives": "GOAL", "business_processes": "BP",
            "requirements": "REQ", "systems_and_applications": "SYS", "data_entities": "DE",
            "risks_and_constraints": "RISK", "metrics_and_kpis": "KPI"
        }
        prefix = prefix_map.get(entity_type_key, entity_type_key[:3].upper())

    next_num = max_num + 1
    return f"{prefix}{next_num:03d}"

# --- Request Handler Class ---
class APIRequestHandler(http.server.BaseHTTPRequestHandler):

    # --- CORS Headers ---
    def send_cors_headers(self):
        """Sends headers necessary for Cross-Origin Resource Sharing."""
        self.send_header("Access-Control-Allow-Origin", "*") # Allow any origin
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        """Respond to preflight CORS requests."""
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_cors_headers()
        self.end_headers()

    # --- Response Helpers ---
    def send_json_response(self, data, status_code=HTTPStatus.OK):
        """Sends a JSON response."""
        self.send_response(status_code)
        self.send_cors_headers()
        self.send_header("Content-type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def send_error_response(self, message, status_code=HTTPStatus.BAD_REQUEST):
        """Sends a JSON error response."""
        error_data = {"error": message}
        self.send_json_response(error_data, status_code)

    def send_no_content_response(self):
        """Sends a 204 No Content response (e.g., after successful DELETE)."""
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_cors_headers()
        self.end_headers()

    # --- Request Body Parsing ---
    def parse_json_body(self):
        """Parses JSON data from the request body."""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                return None # Or raise an error if body is expected
            body = self.rfile.read(content_length)
            return json.loads(body.decode('utf-8'))
        except (TypeError, ValueError, json.JSONDecodeError) as e:
            raise ValueError(f"Invalid JSON received: {e}") from e # Raise specific error

    # --- GET Handler ---
    def do_GET(self):
        """Handles GET requests for listing or retrieving entities."""
        parsed_path = urlparse(self.path)
        path_parts = parsed_path.path.strip('/').split('/')

        # Endpoint: /api/entity_types (List all types)
        if path_parts == ["api", "entity_types"]:
             current_data = load_data()
             entity_types = list(current_data.keys())
             self.send_json_response(entity_types)
             return

        # Endpoint: /api/entities/{entity_type} (List items of a type)
        # Endpoint: /api/entities/{entity_type}/{item_id} (Get specific item)
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
                    self.send_error_response(f"Item with ID '{item_id}' not found in '{entity_type}'.", 
HTTPStatus.NOT_FOUND)
            # List all items for the type
            elif len(path_parts) == 3:
                self.send_json_response(current_data[entity_type])
            else:
                 self.send_error_response("Invalid API path.", HTTPStatus.BAD_REQUEST)
            return

        # Serve frontend files (optional, but convenient)
        if parsed_path.path == "/" or parsed_path.path == "/index.html":
             self.serve_static_file("index.html", "text/html")
        elif parsed_path.path == "/app.js":
             self.serve_static_file("app.js", "application/javascript")
        else:
            # Default 404 for other paths
            self.send_error_response("API Endpoint not found.", HTTPStatus.NOT_FOUND)

    # --- POST Handler (Create) ---
    def do_POST(self):
        """Handles POST requests to create new entities."""
        parsed_path = urlparse(self.path)
        path_parts = parsed_path.path.strip('/').split('/')

        # Endpoint: /api/entities/{entity_type}
        if len(path_parts) == 3 and path_parts[0] == "api" and path_parts[1] == "entities":
            entity_type = path_parts[2]
            current_data = load_data()

            if entity_type not in current_data:
                self.send_error_response(f"Entity type '{entity_type}' not found.", HTTPStatus.NOT_FOUND)
                return

            try:
                new_item_data = self.parse_json_body()
                if not new_item_data or not isinstance(new_item_data, dict):
                    raise ValueError("Invalid or empty JSON data received for new item.")

                # Generate ID and add item
                new_id = generate_next_id(entity_type, current_data)
                new_item_data['id'] = new_id
                current_data[entity_type].append(new_item_data)

                if save_data(current_data):
                    self.send_json_response(new_item_data, HTTPStatus.CREATED) # Respond with created item
                else:
                    # Rollback addition if save fails? More complex, maybe just log error.
                    self.send_error_response("Failed to save data.", HTTPStatus.INTERNAL_SERVER_ERROR)

            except ValueError as e:
                self.send_error_response(str(e), HTTPStatus.BAD_REQUEST)
            except Exception as e:
                print(f"Unexpected error in POST: {e}")
                self.send_error_response("An internal server error occurred.", 
HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        self.send_error_response("Invalid API endpoint for POST.", HTTPStatus.METHOD_NOT_ALLOWED)


    # --- PUT Handler (Update) ---
    def do_PUT(self):
        """Handles PUT requests to update existing entities."""
        parsed_path = urlparse(self.path)
        path_parts = parsed_path.path.strip('/').split('/')

        # Endpoint: /api/entities/{entity_type}/{item_id}
        if len(path_parts) == 4 and path_parts[0] == "api" and path_parts[1] == "entities":
            entity_type = path_parts[2]
            item_id = path_parts[3]
            current_data = load_data()

            if entity_type not in current_data:
                self.send_error_response(f"Entity type '{entity_type}' not found.", HTTPStatus.NOT_FOUND)
                return

            # Find the index of the item to update
            item_index = -1
            for i, item in enumerate(current_data[entity_type]):
                if item.get("id") == item_id:
                    item_index = i
                    break

            if item_index == -1:
                self.send_error_response(f"Item with ID '{item_id}' not found in '{entity_type}'.", 
HTTPStatus.NOT_FOUND)
                return

            try:
                update_data = self.parse_json_body()
                if not update_data or not isinstance(update_data, dict):
                    raise ValueError("Invalid or empty JSON data received for update.")

                # Update the item in the list (replace entirely or merge keys?)
                # Let's merge: keep existing ID, update other fields from request body
                original_item = current_data[entity_type][item_index]
                original_item.update(update_data)
                original_item['id'] = item_id # Ensure ID isn't accidentally overwritten

                current_data[entity_type][item_index] = original_item # Put updated item back

                if save_data(current_data):
                    self.send_json_response(original_item, HTTPStatus.OK) # Respond with updated item
                else:
                    # Consider rollback on failure
                    self.send_error_response("Failed to save updated data.", 
HTTPStatus.INTERNAL_SERVER_ERROR)

            except ValueError as e:
                self.send_error_response(str(e), HTTPStatus.BAD_REQUEST)
            except Exception as e:
                print(f"Unexpected error in PUT: {e}")
                self.send_error_response("An internal server error occurred.", 
HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        self.send_error_response("Invalid API endpoint for PUT.", HTTPStatus.METHOD_NOT_ALLOWED)


    # --- DELETE Handler ---
    def do_DELETE(self):
        """Handles DELETE requests to remove entities."""
        parsed_path = urlparse(self.path)
        path_parts = parsed_path.path.strip('/').split('/')

        # Endpoint: /api/entities/{entity_type}/{item_id}
        if len(path_parts) == 4 and path_parts[0] == "api" and path_parts[1] == "entities":
            entity_type = path_parts[2]
            item_id = path_parts[3]
            current_data = load_data()

            if entity_type not in current_data:
                self.send_error_response(f"Entity type '{entity_type}' not found.", HTTPStatus.NOT_FOUND)
                return

            initial_len = len(current_data[entity_type])
            current_data[entity_type] = [item for item in current_data[entity_type] if item.get("id") != 
item_id]

            if len(current_data[entity_type]) < initial_len: # Deletion happened
                if save_data(current_data):
                    self.send_no_content_response() # Success, no content to return
                else:
                    # Consider rollback on failure
                    self.send_error_response("Failed to save data after deletion.", 
HTTPStatus.INTERNAL_SERVER_ERROR)
            else: # Item ID was not found
                self.send_error_response(f"Item with ID '{item_id}' not found in '{entity_type}' for deletion.", HTTPStatus.NOT_FOUND)
            return

        self.send_error_response("Invalid API endpoint for DELETE.", HTTPStatus.METHOD_NOT_ALLOWED)

    # --- Static File Serving (Helper) ---
    def serve_static_file(self, filename, content_type):
         """Serves a static file from the current directory."""
         try:
             filepath = os.path.join(os.path.dirname(__file__), filename)
             if os.path.exists(filepath):
                  with open(filepath, 'rb') as f:
                      self.send_response(HTTPStatus.OK)
                      self.send_header("Content-type", content_type)
                      fs = os.fstat(f.fileno())
                      self.send_header("Content-Length", str(fs.st_size))
                      self.end_headers()
                      self.wfile.write(f.read())
             else:
                  self.send_error_response(f"{filename} not found.", HTTPStatus.NOT_FOUND)
         except Exception as e:
              print(f"Error serving static file {filename}: {e}")
              self.send_error_response("Error serving file.", HTTPStatus.INTERNAL_SERVER_ERROR)


# --- Main Execution ---
if __name__ == "__main__":
    # Use ThreadingMixIn for handling multiple requests concurrently
    from socketserver import ThreadingMixIn
    class ThreadingHTTPServer(ThreadingMixIn, http.server.HTTPServer):
        pass # Server subclass that uses threads to handle requests

    # Load initial data once to check file existence/validity on startup
    load_data()
    print(f"Initial data loaded check complete. Using: {DATA_FILE}")

    httpd = ThreadingHTTPServer((HOST, PORT), APIRequestHandler)

    print(f"Serving API and Frontend on http://{HOST}:{PORT}")
    print("API endpoints available under /api/")
    print("Frontend available at /")
    print("Press Ctrl+C to stop the server.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopping.")
        httpd.server_close()


