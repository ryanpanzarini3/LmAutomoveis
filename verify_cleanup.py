from pathlib import Path
import re
files = [Path('index.html'), Path('estoque.html'), Path('detalhes.html'), Path('contato.html'), Path('financiamento.html')]
pat = re.compile(r'Ã|â€|â€œ|â€\u009d|â€¢|Â|â€™|â€“|â€”|â€ž|â€˜|â€•|â€¡')
for path in files:
    text = path.read_text(encoding='utf-8', errors='ignore')
    matches = [line for line in text.splitlines() if pat.search(line)]
    if matches:
        print(path)
        for line in matches[:20]:
            print('  ', line[:220])
