import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CATEGORY_GUIDE = `
카테고리 코드 목록 (반드시 아래 코드 중 하나만 반환):
- CAT_WELFARE: 지원금, 복지, 수당, 장학금, 보조금
- CAT_EDUCATION: 교육, 취업, 훈련, 강의, 공모전, 대회
- CAT_CULTURE: 문화, 행사, 축제, 전시, 공연
- CAT_HOUSING: 주거, 금융, 임대, 대출, 부동산
- CAT_BUSINESS: 소상공인, 창업, 자영업, 사업 지원
- CAT_FAMILY: 육아, 가족, 출산, 보육, 아동
- CAT_HEALTH: 건강, 의료, 병원, 검진, 치료
- CAT_OTHER: 위에 해당하지 않는 기타
`.trim()

async function searchOfficialLink(title: string, orgName: string): Promise<string | null> {
  const tavilyKey = Deno.env.get("TAVILY_API_KEY")
  if (!tavilyKey) return null

  const query = `${title} ${orgName} 공식 공고 신청`

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: tavilyKey,
        query,
        search_depth: "basic",
        max_results: 3,
        include_domains: [],
        exclude_domains: ["youtube.com", "facebook.com", "instagram.com", "twitter.com"],
      }),
    })

    if (!res.ok) return null

    const data = await res.json()
    const results = data.results ?? []

    // 공식 도메인(.go.kr, .or.kr, .ac.kr) 우선, 없으면 첫 번째 결과
    const official = results.find((r: any) =>
      /\.go\.kr|\.or\.kr|\.ac\.kr|\.edu\.kr/.test(r.url)
    )

    return official?.url ?? results[0]?.url ?? null
  } catch {
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { imageBase64 } = await req.json()
    if (!imageBase64) throw new Error("Missing imageBase64 data.")

    const openaiKey = Deno.env.get("OPENAI_API_KEY")
    if (!openaiKey) throw new Error("OPENAI_API_KEY is not configured.")

    const prompt = `이 포스터/공고 이미지를 분석하여 아래 JSON 형식으로만 응답하세요. 마크다운 없이 JSON만 반환하세요.

{
  "title": "공고 제목 (전체)",
  "sourceOrgName": "주관 기관명",
  "categoryId": "${CATEGORY_GUIDE.split('\n').filter(l => l.startsWith('-')).map(l => l.split(':')[0].replace('- ', '').trim()).join(' | ')}",
  "appEndAt": "신청 마감일 (YYYY-MM-DD 형식, 없으면 null)",
  "summaryShort": "공고 핵심 내용 2~3문장 요약 (한국어)",
  "officialLink": "공식 URL (이미지에 있으면, 없으면 null)"
}

카테고리 선택 기준:
${CATEGORY_GUIDE}`

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 800,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                  detail: "high"
                }
              },
              {
                type: "text",
                text: prompt
              }
            ]
          }
        ]
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`OpenAI API error: ${response.status} ${errText}`)
    }

    const aiResult = await response.json()
    const content = aiResult.choices?.[0]?.message?.content ?? ""

    let parsed: any = {}
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
    } catch {
      throw new Error("AI 응답 파싱 실패: " + content)
    }

    // 이미지에서 URL을 못 찾은 경우 Tavily로 검색
    let officialLink = parsed.officialLink ?? null
    if (!officialLink && parsed.title) {
      officialLink = await searchOfficialLink(parsed.title, parsed.sourceOrgName ?? "")
    }

    return new Response(JSON.stringify({
      title: parsed.title ?? null,
      sourceOrgName: parsed.sourceOrgName ?? null,
      categoryId: parsed.categoryId ?? null,
      appEndAt: parsed.appEndAt ?? null,
      summaryShort: parsed.summaryShort ?? null,
      officialLink,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
