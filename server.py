import http.server
import json
import socketserver

PORT = 8000

class MyHttpRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/':
            self.path = 'index.html'
        elif self.path == '/api/data':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            with open('data.json', 'r') as file:
                data = json.load(file)
                requirements_data = data.get('requirements', [])
                response = {
                    'message': 'Requirements data from the server!',
                    'data': requirements_data
                }
                self.wfile.write(json.dumps(response).encode('utf-8'))
            return
        return http.server.SimpleHTTPRequestHandler.do_GET(self)

Handler = MyHttpRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at port {PORT}")
    httpd.serve_forever()
