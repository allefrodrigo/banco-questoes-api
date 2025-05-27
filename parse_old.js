import mammoth from 'mammoth';
import TurndownService from 'turndown';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function convertDoc() {
  const filePath = path.join(__dirname, 'questions', 'pack-1.docx');
  const buffer = await fs.readFile(filePath);

  const { value: html } = await mammoth.convertToHtml(
    { buffer },
    {
      convertImage: mammoth.images.inline(element =>
        element.read('base64').then(buf => ({
          src: 'data:' + element.contentType + ';base64,' + buf
        }))
      )
    }
  );

  const turndownService = new TurndownService();
  let markdown = turndownService.turndown(html);

  // Remove a capa sem placeholder
  markdown = markdown.replace(
    /!?\[\]\(data:image\/jpeg;base64,[^)]+\)/gi,
    ''
  );

  const listBlocks = markdown.split(/(?=^LISTA\s+\d+)/m);
  const listas = [];

  for (const block of listBlocks) {
    if (!block.trim()) continue;

    const listObj = {
      nome: '',
      proficiencia: '',
      questoes: [],
      gabarito: {}
    };

    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] && /^LISTA\s+\d+/i.test(lines[0])) {
      listObj.nome = lines[0];
    }
    const profLine = lines.find(l => /^Profici[êe]ncia\s+/i.test(l));
    if (profLine) {
      listObj.proficiencia = profLine.replace(/^Profici[êe]ncia\s*/i, '').trim();
    }

    let questionPart = block;
    let gabaritoPart = '';
    if (/GABARITO:/i.test(block)) {
      const parts = block.split(/GABARITO:/i);
      questionPart = parts[0];
      gabaritoPart = parts[1];
    }

    const questionRegex = /QUESTÃO:\s*(\d+)([\s\S]+?)(?=QUESTÃO:|$)/gi;
    let match;
    while ((match = questionRegex.exec(questionPart)) !== null) {
      const qNum = match[1].trim();
      const q = {
        number: qNum,
        prova: '',
        probabilidade: '',
        enunciado: '',
        alternatives: {}
      };

      let content = match[2].trim();

      // Substituir imagens inline por [imagem-questao-N-M]
      let imgCount = 1;
      content = content.replace(
        /!?\[\]\(data:image\/[^\)]+\)/gi,
        () => `[imagem-questao-${qNum}-${imgCount++}]`
      );

      const provaMatch = content.match(/PROVA:\s*(.+)/i);
      if (provaMatch) q.prova = provaMatch[1].trim();

      const probMatch = content.match(/PROBABILIDADE DE ACERTO AO ACASO:\s*([\d.,]+)%/i);
      if (probMatch) {
        q.probabilidade = probMatch[1].trim().replace(',', '.');
      }

      content = content
        .replace(/PROVA:\s*.+/i, '')
        .replace(/PROBABILIDADE DE ACERTO AO ACASO:\s*[\d.,]+%/i, '')
        .trim();

      const altStartIndex = content.search(/^[a-e]\)/im);
      if (altStartIndex !== -1) {
        q.enunciado = content.substring(0, altStartIndex).trim();
        const altLines = content.substring(altStartIndex).trim().split(/\n(?=[a-e]\))/i);
        for (const line of altLines) {
          const altMatch = line.match(/([a-e])\)\s*(.*)/i);
          if (altMatch) {
            q.alternatives[altMatch[1]] = altMatch[2].trim();
          }
        }
      } else {
        q.enunciado = content;
      }

      listObj.questoes.push(q);
    }

    if (gabaritoPart) {
      const gabRegex = /(\d+)[\.\s-]*([A-Z])/gi;
      let gabMatch;
      while ((gabMatch = gabRegex.exec(gabaritoPart)) !== null) {
        // guarda em lowercase
        listObj.gabarito[gabMatch[1].trim()] = gabMatch[2].trim().toLowerCase();
      }
    }

    // Atrelando resposta à alternativa
    listObj.questoes.forEach(q => {
      if (listObj.gabarito[q.number]) {
        q.answer = listObj.gabarito[q.number];
      }
    });

    listas.push(listObj);
  }

  return listas;
}

(async () => {
  try {
    const listas = await convertDoc();
    const data = { listas };
    const outputPath = path.join(__dirname, 'output.json');
    await fs.writeFile(outputPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Conversão concluída. Resultado salvo em ${outputPath}`);
  } catch (error) {
    console.error('Erro durante conversão:', error);
    process.exit(1);
  }
})();
