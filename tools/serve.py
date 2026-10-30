
import http.server, urllib.request, sys, os
ROOT=sys.argv[1]; PORT=int(sys.argv[2])
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s,*a,**k): super().__init__(*a,directory=ROOT,**k)
    def do_GET(s):
        if s.path.startswith('/api/'):
            try:
                with urllib.request.urlopen(urllib.request.Request('https://dead-language-live.sites.tab.bot'+s.path,headers={'user-agent':'Mozilla/5.0 (X11; Linux x86_64) Chrome/130'}),timeout=20) as r:
                    b=r.read(); s.send_response(r.status); s.send_header('content-type',r.headers.get('content-type','application/octet-stream')); s.send_header('content-length',str(len(b))); s.end_headers(); s.wfile.write(b)
            except Exception as e:
                s.send_response(502); s.end_headers()
            return
        return super().do_GET()
    def log_message(s,*a): pass
http.server.ThreadingHTTPServer(('127.0.0.1',PORT),H).serve_forever()
