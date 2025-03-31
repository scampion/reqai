import http.server
import json
import socketserver
from urllib.parse import parse_qs, urlparse

PORT = 8001

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
                response = {
                    'requirements': data.get('requirements', []),
                    'stakeholders': data.get('stakeholders', []),
                    'goals_and_objectives': data.get('goals_and_objectives', []),
                    'business_processes': data.get('business_processes', []),
                    'systems_and_applications': data.get('systems_and_applications', []),
                    'data_entities': data.get('data_entities', []),
                    'metrics_and_kpis': data.get('metrics_and_kpis', [])
                }
                self.wfile.write(json.dumps(response).encode('utf-8'))
            return
        return http.server.SimpleHTTPRequestHandler.do_GET(self)

    def do_POST(self):
        if self.path == '/api/data':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            item = json.loads(post_data)
            with open('data.json', 'r+') as file:
                data = json.load(file)
                if 'id' in item and 'description' in item:
                    if item['id'].startswith('REQ'):
                        if not item['id'].startswith('REQ'):
                            item['id'] = 'REQ' + item['id']
                        data['requirements'].append(item)
                    elif item['id'].startswith('STK'):
                        data['stakeholders'].append(item)
                    elif item['id'].startswith('GOAL'):
                        data['goals_and_objectives'].append(item)
                    elif item['id'].startswith('BP'):
                        data['business_processes'].append(item)
                    elif item['id'].startswith('SYS'):
                        data['systems_and_applications'].append(item)
                    elif item['id'].startswith('DE'):
                        data['data_entities'].append(item)
                    elif item['id'].startswith('KPI'):
                        data['metrics_and_kpis'].append(item)
                    file.seek(0)
                    json.dump(data, file, indent=4)
                    file.truncate()
            self.send_response(201)
            self.end_headers()
            response = {
                'message': 'Item added successfully!',
                'requirements': data.get('requirements', []),
                'stakeholders': data.get('stakeholders', []),
                'goals_and_objectives': data.get('goals_and_objectives', []),
                'business_processes': data.get('business_processes', []),
                'systems_and_applications': data.get('systems_and_applications', []),
                'data_entities': data.get('data_entities', []),
                'metrics_and_kpis': data.get('metrics_and_kpis', [])
            }
            self.wfile.write(json.dumps(response).encode('utf-8'))

    def do_PUT(self):
        if self.path == '/api/data':
            content_length = int(self.headers['Content-Length'])
            put_data = self.rfile.read(content_length)
            item = json.loads(put_data)
            with open('data.json', 'r+') as file:
                data = json.load(file)
                if 'id' in item and 'description' in item:
                    if item['id'].startswith('REQ'):
                        for i, req in enumerate(data['requirements']):
                            if req['id'] == item['id']:
                                data['requirements'][i] = item
                                break
                    elif item['id'].startswith('STK'):
                        for i, stk in enumerate(data['stakeholders']):
                            if stk['id'] == item['id']:
                                data['stakeholders'][i] = item
                                break
                    elif item['id'].startswith('GOAL'):
                        for i, goal in enumerate(data['goals_and_objectives']):
                            if goal['id'] == item['id']:
                                data['goals_and_objectives'][i] = item
                                break
                    elif item['id'].startswith('BP'):
                        for i, bp in enumerate(data['business_processes']):
                            if bp['id'] == item['id']:
                                data['business_processes'][i] = item
                                break
                    elif item['id'].startswith('SYS'):
                        for i, sys in enumerate(data['systems_and_applications']):
                            if sys['id'] == item['id']:
                                data['systems_and_applications'][i] = item
                                break
                    elif item['id'].startswith('DE'):
                        for i, de in enumerate(data['data_entities']):
                            if de['id'] == item['id']:
                                data['data_entities'][i] = item
                                break
                    elif item['id'].startswith('KPI'):
                        for i, kpi in enumerate(data['metrics_and_kpis']):
                            if kpi['id'] == item['id']:
                                data['metrics_and_kpis'][i] = item
                                break
                    file.seek(0)
                    json.dump(data, file, indent=4)
                    file.truncate()
            self.send_response(200)
            self.end_headers()
            response = {
                'message': 'Item updated successfully!',
                'requirements': data.get('requirements', []),
                'stakeholders': data.get('stakeholders', []),
                'goals_and_objectives': data.get('goals_and_objectives', []),
                'business_processes': data.get('business_processes', []),
                'systems_and_applications': data.get('systems_and_applications', []),
                'data_entities': data.get('data_entities', []),
                'metrics_and_kpis': data.get('metrics_and_kpis', [])
            }
            self.wfile.write(json.dumps(response).encode('utf-8'))

    def do_DELETE(self):
        if self.path.startswith('/api/data?'):
            query_components = parse_qs(urlparse(self.path).query)
            item_id = query_components['id'][0]
            with open('data.json', 'r+') as file:
                data = json.load(file)
                if item_id.startswith('REQ'):
                    data['requirements'] = [req for req in data['requirements'] if req['id'] != item_id]
                elif item_id.startswith('STK'):
                    data['stakeholders'] = [stk for stk in data['stakeholders'] if stk['id'] != item_id]
                elif item_id.startswith('GOAL'):
                    data['goals_and_objectives'] = [goal for goal in data['goals_and_objectives'] if goal['id'] != item_id]
                elif item_id.startswith('BP'):
                    data['business_processes'] = [bp for bp in data['business_processes'] if bp['id'] != item_id]
                elif item_id.startswith('SYS'):
                    data['systems_and_applications'] = [sys for sys in data['systems_and_applications'] if sys['id'] != item_id]
                elif item_id.startswith('DE'):
                    data['data_entities'] = [de for de in data['data_entities'] if de['id'] != item_id]
                elif item_id.startswith('KPI'):
                    data['metrics_and_kpis'] = [kpi for kpi in data['metrics_and_kpis'] if kpi['id'] != item_id]
                file.seek(0)
                json.dump(data, file, indent=4)
                file.truncate()
            self.send_response(200)
            self.end_headers()
            response = {
                'message': 'Item deleted successfully!',
                'requirements': data.get('requirements', []),
                'stakeholders': data.get('stakeholders', []),
                'goals_and_objectives': data.get('goals_and_objectives', []),
                'business_processes': data.get('business_processes', []),
                'systems_and_applications': data.get('systems_and_applications', []),
                'data_entities': data.get('data_entities', []),
                'metrics_and_kpis': data.get('metrics_and_kpis', [])
            }
            self.wfile.write(json.dumps(response).encode('utf-8'))

Handler = MyHttpRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at port {PORT}")
    httpd.serve_forever()

    import webbrowser
    url = "http://localhost:" + str(PORT)
    webbrowser.open(url, new=0, autoraise=True)
