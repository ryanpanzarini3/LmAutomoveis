from pathlib import Path

files = [
    Path('index.html'),
    Path('estoque.html'),
    Path('detalhes.html'),
    Path('contato.html'),
    Path('financiamento.html'),
    Path('sobre.html'),
]

replacements = [
    ('Ã¡', 'á'), ('Ã©', 'é'), ('Ãª', 'ê'), ('Ã£', 'ã'), ('Ã³', 'ó'), ('Ã´', 'ô'), ('Ãº', 'ú'), ('Ã§', 'ç'), ('Ã¼', 'ü'), ('Ã±', 'ñ'),
    ('Ã¢', 'â'), ('Ã¨', 'è'), ('Ã¬', 'ì'), ('Ã²', 'ò'), ('Ã¹', 'ù'), ('Ã¤', 'ä'), ('Ã¶', 'ö'), ('Ã«', 'ë'), ('Ã¯', 'ï'), ('Ã­', 'í'),
    ('Ã', 'Á'), ('Ã‰', 'É'), ('ÃŠ', 'Ê'), ('Ãƒ', 'Ã'), ('Ã“', 'Ó'), ('Ã”', 'Ô'), ('Ãš', 'Ú'), ('Ã‡', 'Ç'), ('Ãœ', 'Ü'), ('Ã€', 'À'), ('Ãˆ', 'È'), ('ÃŒ', 'Ì'), ('ÃŽ', 'Î'), ('Ã–', 'Ö'), ('Ã™', 'Ù'), ('Ã¥', 'å'),
    ('â€¢', '•'), ('â€œ', '“'), ('â€', '”'), ('â€™', '’'), ('â€“', '–'), ('â€”', '—'), ('âœ“', '✔'), ('â€ž', 'º'), ('â€˜', '‘'), ('â€•', '’'), ('â€¡', '‡'), ('Â©', '©'), ('Â°', '°'), ('Âº', 'º'),
    ('AutomÃ³veis', 'Automóveis'), ('AutomÃ³vel', 'Automóvel'), ('VeÃ­culos', 'Veículos'), ('veÃ­culo', 'veículo'), ('VeÃ­culo', 'Veículo'),
    ('PreÃ§o', 'Preço'), ('PreÃ§Ã£o', 'Preço'), ('Pre�o', 'Preço'), ('Faixa de PreÃ§o', 'Faixa de Preço'), ('CombustÃ­vel', 'Combustível'), ('BotÃµes', 'Botões'), ('DireÃ§Ã£o', 'Direção'), ('DireÃ§Ã£o HidrÃ¡ulica', 'Direção Hidráulica'), ('DireÃ§Ã£o ElÃ©trica', 'Direção Elétrica'), ('HidrÃ¡ulica', 'Hidráulica'), ('ElÃ©trica', 'Elétrica'), ('Central MultimÃ­dia', 'Central Multimídia'), ('CÃ¢mera de RÃ©', 'Câmera de Ré'), ('Sensor de RÃ©', 'Sensor de Ré'), ('AutomÃ¡tico', 'Automático'), ('Retorno em atÃ© 1 dia Ãºtil', 'Retorno em até 1 dia útil'), ('entrarÃ¡ em contato', 'entrará em contato'), ('SimulaÃ§Ã£o', 'Simulação'), ('AprovaÃ§Ã£o', 'Aprovação'), ('InstituiÃ§Ãµes', 'Instituições'), ('instituiÃ§Ãµes', 'instituições'), ('DocumentaÃ§Ã£o', 'Documentação'), ('aprovaÃ§Ã£o', 'aprovação'), ('FaÃ§a', 'Faça'), ('Escolha o VeÃ­culo', 'Escolha o Veículo'), ('Selecione um veÃ­culo', 'Selecione um veículo'), ('Nenhum veÃ­culo similar', 'Nenhum veículo similar'), ('Carregando imagem do veÃ­culo', 'Carregando imagem do veículo'), ('condiÃ§Ãµes', 'condições'), ('sujeito Ã ', 'sujeito à'), ('Ã s', 'às'), ('NÃºmero', 'Número'), ('Ãºltimos', 'últimos'), ('Pessoa FÃ­sica', 'Pessoa Física'), ('Pessoa JurÃ­dica', 'Pessoa Jurídica'), ('CondiÃ§Ãµes', 'Condições')
]

for path in files:
    if not path.exists():
        continue
    text = path.read_text(encoding='utf-8', errors='replace')
    original = text
    for old, new in replacements:
        text = text.replace(old, new)
    text = text.replace('�', '')
    if text != original:
        path.write_text(text, encoding='utf-8')
        print(f'updated {path}')
