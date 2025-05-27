// parser.js
import mammoth from 'mammoth'
import TurndownService from 'turndown'

/**
 * Recebe um Buffer de um DOCX e retorna um array de listas parseadas.
 * @param {Buffer} buffer
 * @returns {Promise<Array<{ nome: string, proficiencia: string, questoes: any[], gabarito: Record<string,string> }>>}
 */
export async function parseDocx(buffer) {
  // converte DOCX → HTML com imagens inline
  const { value: html } = await mammoth.convertToHtml(
    { buffer },
    {
      convertImage: mammoth.images.inline(element =>
        element.read('base64').then(buf => ({
          src: 'data:' + element.contentType + ';base64,' + buf
        }))
      )
    }
  )

  // converte HTML → Markdown
  const turndownService = new TurndownService()
  let markdown = turndownService.turndown(html)

  // remove a capa (jpeg) sem placeholder
  markdown = markdown.replace(
    /!?\[\]\(data:image\/jpeg;base64,[^)]+\)/gi,
    ''
  )

  // divide em blocos que começam com "LISTA"
  const listBlocks = markdown.split(/(?=^LISTA\s+\d+)/m)
  const listas = []

  for (const block of listBlocks) {
    if (!block.trim()) continue

    const listObj = {
      nome: '',
      proficiencia: '',
      questoes: [],
      gabarito: {}
    }

    const lines = block
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)

    // nome da lista
    if (lines[0] && /^LISTA\s+\d+/i.test(lines[0])) {
      listObj.nome = lines[0]
    }

    // proficiência
    const profLine = lines.find(l => /^Profici[êe]ncia\s+/i.test(l))
    if (profLine) {
      listObj.proficiencia = profLine
        .replace(/^Profici[êe]ncia\s*/i, '')
        .trim()
    }

    // separa bloco de questões e gabarito
    let questionPart = block
    let gabaritoPart = ''
    if (/GABARITO:/i.test(block)) {
      const parts = block.split(/GABARITO:/i)
      questionPart = parts[0]
      gabaritoPart = parts[1]
    }

    // extrai cada questão
    const questionRegex = /QUESTÃO:\s*(\d+)([\s\S]+?)(?=QUESTÃO:|$)/gi
    let match
    while ((match = questionRegex.exec(questionPart)) !== null) {
      const qNum = match[1].trim()
      let content = match[2].trim()

      // substitui imagens inline por [imagem-questao-N-M]
      let imgCount = 1
      content = content.replace(
        /!?\[\]\(data:image\/[^\)]+\)/gi,
        () => `[imagem-questao-${qNum}-${imgCount++}]`
      )

      const q = {
        number: qNum,
        prova: '',
        probabilidade: '',
        enunciado: '',
        alternatives: {},
      }

      // prova
      const provaMatch = content.match(/PROVA:\s*(.+)/i)
      if (provaMatch) {
        q.prova = provaMatch[1].trim()
      }

      // probabilidade
      const probMatch = content.match(
        /PROBABILIDADE DE ACERTO AO ACASO:\s*([\d.,]+)%/i
      )
      if (probMatch) {
        q.probabilidade = probMatch[1]
          .trim()
          .replace(',', '.')
      }

      // remove metadados
      content = content
        .replace(/PROVA:\s*.+/i, '')
        .replace(
          /PROBABILIDADE DE ACERTO AO ACASO:\s*[\d.,]+%/i,
          ''
        )
        .trim()

      // separa enunciado e alternativas
      const altStartIndex = content.search(/^[a-e]\)/im)
      if (altStartIndex !== -1) {
        q.enunciado = content
          .substring(0, altStartIndex)
          .trim()
        const altLines = content
          .substring(altStartIndex)
          .trim()
          .split(/\n(?=[a-e]\))/i)
        for (const line of altLines) {
          const altMatch = line.match(/([a-e])\)\s*(.*)/i)
          if (altMatch) {
            q.alternatives[altMatch[1]] = altMatch[2].trim()
          }
        }
      } else {
        q.enunciado = content
      }

      listObj.questoes.push(q)
    }

    // parse do gabarito
    if (gabaritoPart) {
      const gabRegex = /(\d+)[\.\s-]*([A-Z])/gi
      let gabMatch
      while ((gabMatch = gabRegex.exec(gabaritoPart)) !== null) {
        listObj.gabarito[gabMatch[1].trim()] =
          gabMatch[2].trim().toLowerCase()
      }
    }

    // associa resposta a cada questão
    listObj.questoes.forEach(q => {
      if (listObj.gabarito[q.number]) {
        q.answer = listObj.gabarito[q.number]
      }
    })

    listas.push(listObj)
  }

  return listas
}
