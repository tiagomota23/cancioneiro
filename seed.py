"""Carrega songs.json na tabela songs do Supabase (upsert por slug).
Uso: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python3 seed.py songs.json"""
import json, os, sys, urllib.request
url, key = os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY']
songs = json.load(open(sys.argv[1] if len(sys.argv) > 1 else 'songs.json', encoding='utf-8'))
for i in range(0, len(songs), 100):
    req = urllib.request.Request(
        f'{url}/rest/v1/songs?on_conflict=slug', method='POST',
        data=json.dumps(songs[i:i + 100], ensure_ascii=False).encode(),
        headers={'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json',
                 'Prefer': 'resolution=merge-duplicates,return=minimal'})
    urllib.request.urlopen(req).read()
    print(f'{min(i + 100, len(songs))}/{len(songs)}')
