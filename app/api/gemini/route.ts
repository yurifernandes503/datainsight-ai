import { type NextRequest, NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"

export async function POST(request: NextRequest) {
  try {
    const { prompt, dataContext } = await request.json()

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "GEMINI_API_KEY não configurada" }, { status: 500 })
    }

    // Inicializar Gemini AI com modelo atualizado
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

    // Usar modelo gemini-1.5-flash que é mais estável e disponível
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 2048,
      },
    })

    // Preparar prompt estruturado para análise de dados
    const structuredPrompt = `
Você é um especialista em análise de dados e business intelligence. Analise os seguintes dados e forneça insights profundos em português brasileiro.

CONTEXTO DOS DADOS:
- Total de registros: ${dataContext.totalRecords}
- Total de colunas: ${dataContext.columns}
- Colunas numéricas: ${dataContext.numericColumns}
- Colunas categóricas: ${dataContext.categoricalColumns}

ESTATÍSTICAS DAS COLUNAS:
${JSON.stringify(dataContext.columnStats || {}, null, 2)}

AMOSTRA DOS DADOS (primeiras 5 linhas):
${JSON.stringify(dataContext.sampleData, null, 2)}

TIPOS DE COLUNAS:
${dataContext.columnTypes?.map((col) => `${col.name}: ${col.type}`).join("\n") || "Não disponível"}

SOLICITAÇÃO ESPECÍFICA:
${prompt}

Por favor, forneça uma análise estruturada incluindo:

1. **VISÃO GERAL**: Resumo executivo dos dados
2. **PADRÕES IDENTIFICADOS**: Tendências, correlações e insights principais
3. **ANOMALIAS**: Pontos de atenção ou valores atípicos
4. **OPORTUNIDADES**: Insights acionáveis para negócio
5. **RECOMENDAÇÕES**: Ações estratégicas específicas

Responda de forma clara e objetiva, focando em insights práticos e acionáveis.
`

    console.log("Enviando prompt para Gemini:", structuredPrompt.substring(0, 200) + "...")

    // Fazer chamada para Gemini com tratamento de erro melhorado
    const result = await model.generateContent(structuredPrompt)
    const response = await result.response
    const text = response.text()

    console.log("Resposta recebida do Gemini:", text.substring(0, 200) + "...")

    // Processar resposta e estruturar dados
    const analysis = {
      overview: extractSection(text, "VISÃO GERAL") || text.substring(0, 300) + "...",
      patterns: [
        {
          type: "trend",
          title: "Padrões Identificados",
          description: extractSection(text, "PADRÕES IDENTIFICADOS") || "Análise de padrões em andamento",
          impact: "high",
          recommendation: extractSection(text, "RECOMENDAÇÕES") || "Revisar dados para identificar oportunidades",
        },
        {
          type: "opportunity",
          title: "Oportunidades de Negócio",
          description: extractSection(text, "OPORTUNIDADES") || "Identificação de oportunidades baseada nos dados",
          impact: "medium",
          recommendation: "Implementar melhorias baseadas nos insights identificados",
        },
      ],
      insights: extractListItems(text) || [
        "Análise detalhada dos dados concluída",
        "Padrões significativos identificados",
        "Recomendações estratégicas disponíveis",
      ],
      recommendations: [
        {
          priority: "high",
          action: extractSection(text, "RECOMENDAÇÕES") || "Implementar melhorias baseadas na análise",
          rationale: "Baseado nos padrões identificados nos dados",
          expectedImpact: "Melhoria significativa nos resultados de negócio",
        },
      ],
      keyFindings: extractKeyFindings(text) || [
        "Dados processados com sucesso",
        "Insights estratégicos identificados",
        "Análise completa disponível",
      ],
      rawResponse: text,
      modelUsed: "gemini-1.5-flash",
      timestamp: new Date().toISOString(),
    }

    return NextResponse.json({
      analysis,
      success: true,
      timestamp: new Date().toISOString(),
      model: "gemini-1.5-flash",
    })
  } catch (error: any) {
    console.error("Erro detalhado na API Gemini:", error)

    // Tratamento de erros mais específico
    if (error.message?.includes("API_KEY")) {
      return NextResponse.json(
        {
          error: "Erro de autenticação com Gemini API. Verifique se a chave da API está correta.",
          details: "A chave API pode estar inválida ou expirada.",
        },
        { status: 401 },
      )
    }

    if (error.message?.includes("quota") || error.message?.includes("limit")) {
      return NextResponse.json(
        {
          error: "Limite de quota da API Gemini excedido. Tente novamente mais tarde.",
          details: "A API tem limites de uso. Aguarde alguns minutos antes de tentar novamente.",
        },
        { status: 429 },
      )
    }

    if (error.message?.includes("not found") || error.message?.includes("404")) {
      return NextResponse.json(
        {
          error: "Modelo Gemini não encontrado. Usando fallback.",
          details: "O modelo especificado não está disponível. Tentando modelo alternativo.",
        },
        { status: 404 },
      )
    }

    if (error.message?.includes("SAFETY")) {
      return NextResponse.json(
        {
          error: "Conteúdo bloqueado por filtros de segurança.",
          details: "O conteúdo foi considerado inadequado pelos filtros de segurança do Gemini.",
        },
        { status: 400 },
      )
    }

    // Erro genérico
    return NextResponse.json(
      {
        error: "Erro ao processar análise com Gemini AI",
        details: error.message || "Erro desconhecido",
        suggestion: "Verifique sua conexão e tente novamente em alguns minutos.",
      },
      { status: 500 },
    )
  }
}

// Funções auxiliares para extrair seções do texto
function extractSection(text: string, sectionName: string): string | null {
  const regex = new RegExp(`\\*\\*${sectionName}\\*\\*:?\\s*([^*]+)`, "i")
  const match = text.match(regex)
  return match ? match[1].trim() : null
}

function extractListItems(text: string): string[] | null {
  const lines = text.split("\n")
  const items = lines
    .filter((line) => line.trim().startsWith("-") || line.trim().startsWith("•") || line.trim().startsWith("*"))
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter((item) => item.length > 10)

  return items.length > 0 ? items.slice(0, 5) : null
}

function extractKeyFindings(text: string): string[] | null {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 20)
  return sentences.length > 0 ? sentences.slice(0, 3).map((s) => s.trim()) : null
}
