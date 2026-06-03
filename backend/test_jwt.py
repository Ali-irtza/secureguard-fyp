import jwt, time, httpx
from pathlib import Path

key = Path('github-app.pem').read_text()
now = int(time.time())
token = jwt.encode({'iat': now-60, 'exp': now+480, 'iss': '3431274'}, key, algorithm='RS256')

print('JWT OK, making API call...')

resp = httpx.post(
    'https://api.github.com/app/installations/125271338/access_tokens',
    headers={
        'Authorization': f'Bearer {token}',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    },
    timeout=15.0
)

print('Status:', resp.status_code)
print('Response:', resp.text[:300])