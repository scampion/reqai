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

    def do_POST(self):
        if self.path == '/api/data':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            requirement = json.loads(post_data)
            with open('data.json', 'r+') as file:
                data = json.load(file)
                data['requirements'].append(requirement)
                file.seek(0)
                json.dump(data, file, indent=4)
                file.truncate()
            self.send_response(201)
            self.end_headers()
            response = {
                'message': 'Requirement added successfully!',
                'data': data['requirements']
            }
            self.wfile.write(json.dumps(response).encode('utf-8'))

    def do_PUT(self):
        if self.path == '/api/data':
            content_length = int(self.headers['Content-Length'])
            put_data = self.rfile.read(content_length)
            requirement = json.loads(put_data)
            with open('data.json', 'r+') as file:
                data = json.load(file)
                for i, req in enumerate(data['requirements']):
                    if req['id'] == requirement['id']:
                        data['requirements'][i] = requirement
                        break
                file.seek(0)
                json.dump(data, file, indent=4)
                file.truncate()
            self.send_response(200)
            self.end_headers()
            response = {
                'message': 'Requirement updated successfully!',
                'data': data['requirements']
            }
            self.wfile.write(json.dumps(response).encode('utf-8'))

    def do_DELETE(self):
        if self.path.startswith('/api/data?'):
            query_components = parse_qs(urlparse(self.path).query)
            requirement_id = query_components['id'][0]
            with open('data.json', 'r+') as file:
                data = json.load(file)
                data['requirements'] = [req for req in data['requirements'] if req['id'] != requirement_id]
                file.seek(0)
                json.dump(data, file, indent=4)
                file.truncate()
            self.send_response(200)
            self.end_headers()
            response = {
                'message': 'Requirement deleted successfully!',
                'data': data['requirements']
            }
            self.wfile.write(json.dumps(response).encode('utf-8'))

Handler = MyHttpRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at port {PORT}")
    httpd.serve_forever()
