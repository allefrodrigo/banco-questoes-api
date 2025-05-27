// index.js
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { parseDocx } from './parser.js'

const app = express()
const port = process.env.PORT || 3000

// Habilita CORS para todas as origens
app.use(cors())

// Configura o multer para armazenar o arquivo na memória
const storage = multer.memoryStorage()
const upload = multer({ storage })

// Rota POST /convert que recebe um .docx e retorna JSON com as listas
app.post(
  '/convert',
  upload.single('docx'),
  async (req, res) => {
    if (!req.file) {
      return res
        .status(400)
        .json({ error: 'Nenhum arquivo enviado.' })
    }

    try {
      const listas = await parseDocx(req.file.buffer)
      res.json({ listas })
    } catch (error) {
      console.error('Erro ao parsear DOCX:', error)
      res
        .status(500)
        .json({ error: error.toString() })
    }
  }
)

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`)
})
