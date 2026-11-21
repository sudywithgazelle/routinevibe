"""Bundle into one local-preview HTML with no network dependencies."""
from pathlib import Path
import base64,re,json,mimetypes
root=Path(__file__).resolve().parent
html=(root/'index.html').read_text()
css=(root/'styles.css').read_text()
config=(root/'config.js').read_text()
app=(root/'app.js').read_text()
games=(root/'games.js').read_text()
assets={}
for p in (root/'assets').glob('*'):
    typ=mimetypes.guess_type(p.name)[0] or 'application/octet-stream'
    assets[p.name]=f'data:{typ};base64,'+base64.b64encode(p.read_bytes()).decode()
# Inline CSS jigsaw artwork and static HTML portraits.
css=css.replace("url('assets/jigsaw.webp')",f"url('{assets['jigsaw.webp']}')")
for name,data in assets.items():
    html=html.replace('src="assets/'+name+'"','src="'+data+'"')
html=re.sub(r'<link rel="icon"[^>]*>','',html)
html=re.sub(r'<link rel="manifest"[^>]*>','',html)
html=html.replace('<link rel="stylesheet" href="styles.css">','<style>'+css+'</style>')
html=html.replace('<script defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>','')
html=html.replace('<script defer src="config.js"></script>','<script>'+config+'</script>')
html=html.replace('<script defer src="app.js"></script>','<script>window.GAZELLE_ASSETS='+json.dumps(assets,separators=(',',':'))+';</script><script>'+app+'</script>')
html=html.replace('<script defer src="games.js"></script>','<script>'+games+'</script>')
html=html.replace('</title>','</title><!-- Offline local preview: production auth requires the source ZIP and Supabase setup. -->',1)
out=root.parent/'Study_With_Gazelle_V2_Preview.html';out.write_text(html)
print(out,out.stat().st_size)
