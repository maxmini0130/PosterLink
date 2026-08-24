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

type FieldEvidence = {
  field_key?: string
  value_text?: string | null
  value_json?: Record<string, unknown> | null
  confidence?: number | null
  evidence_text?: string | null
  evidence_src?: string | null
}

function compactText(value: unknown, limit: number) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim()
  return text ? text.slice(0, limit) : null
}

function normalizeConfidence(value: unknown) {
  const confidence = Number(value)
  if (!Number.isFinite(confidence)) return 0.4
  return Math.max(0, Math.min(1, Math.round(confidence * 100) / 100))
}

function normalizeFieldKey(value: unknown) {
  const key = String(value ?? "").trim()
  const allowed = new Set([
    "deadline_date",
    "deadline_type",
    "host_org",
    "official_url",
    "is_real_poster",
    "apply_start",
    "category",
    "region",
    "age_min",
    "age_max",
    "target_desc",
    "benefit",
    "apply_method",
    "apply_url",
    "cost",
    "contact",
    "capacity",
    "venue",
  ])
  return allowed.has(key) ? key : null
}

function normalizeEvidenceSrc(value: unknown) {
  const src = String(value ?? "").trim()
  return ["ocr", "body", "attachment", "rule", "operator"].includes(src) ? src : "ocr"
}

function buildFallbackEvidence(parsed: any): FieldEvidence[] {
  const rows: FieldEvidence[] = []
  if (parsed.sourceOrgName) {
    rows.push({
      field_key: "host_org",
      value_text: parsed.sourceOrgName,
      value_json: { name: parsed.sourceOrgName },
      confidence: 0.4,
      evidence_text: parsed.sourceOrgName,
      evidence_src: "ocr",
    })
  }
  if (parsed.appEndAt) {
    rows.push({
      field_key: "deadline_date",
      value_text: parsed.appEndAt,
      value_json: { date: parsed.appEndAt },
      confidence: 0.4,
      evidence_text: parsed.appEndAt,
      evidence_src: "ocr",
    })
  }
  if (parsed.officialLink) {
    rows.push({
      field_key: "official_url",
      value_text: parsed.officialLink,
      value_json: { url: parsed.officialLink },
      confidence: 0.8,
      evidence_text: parsed.officialLink,
      evidence_src: "rule",
    })
  }
  return rows
}

async function writePosterFieldEvidence(posterId: string | null, parsed: any) {
  if (!posterId) return

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRoleKey) return

  const rawEvidence = Array.isArray(parsed.fieldEvidence) && parsed.fieldEvidence.length > 0
    ? parsed.fieldEvidence
    : buildFallbackEvidence(parsed)

  const rows = rawEvidence
    .map((item: FieldEvidence) => {
      const fieldKey = normalizeFieldKey(item.field_key)
      if (!fieldKey) return null
      return {
        poster_id: posterId,
        field_key: fieldKey,
        value_text: compactText(item.value_text, 2000),
        value_json: item.value_json ?? null,
        confidence: normalizeConfidence(item.confidence),
        evidence_text: compactText(item.evidence_text, 300),
        evidence_src: normalizeEvidenceSrc(item.evidence_src),
        extractor: "gpt-4o-ocr-v1",
      }
    })
    .filter(Boolean)

  if (rows.length === 0) return

  const response = await fetch(
    `${supabaseUrl}/rest/v1/poster_field_evidence?on_conflict=poster_id,field_key,extractor`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": serviceRoleKey,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
      },
      body: JSON.stringify(rows),
    },
  )

  if (!response.ok) {
    console.warn(`poster_field_evidence write failed: ${response.status} ${await response.text()}`)
  }
}

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
    const { imageBase64, posterId = null } = await req.json()
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
  "officialLink": "공식 URL (이미지에 있으면, 없으면 null)",
  "fieldEvidence": [
    {
      "field_key": "deadline_date | host_org | official_url | category | target_desc | benefit | apply_method | contact | venue",
      "value_text": "정규화 전 원문 표현",
      "value_json": { "date": "YYYY-MM-DD" },
      "confidence": 0.0,
      "evidence_text": "이미지/OCR에서 실제 근거가 된 문장. 근거 없으면 값을 만들지 말 것",
      "evidence_src": "ocr"
    }
  ],
  "unresolved": ["근거를 찾지 못한 필드명"]
}

카테고리 선택 기준:
${CATEGORY_GUIDE}

규칙:
- 근거 문장을 이미지에서 그대로 인용할 수 없으면 fieldEvidence에 넣지 말고 unresolved에 넣으세요.
- 모집 기간이 명시되지 않으면 deadline_date를 만들지 마세요. 절대 상시 모집으로 추정하지 마세요.
- 날짜는 Asia/Seoul 기준입니다. 연도가 없으면 appEndAt은 null로 두고 낮은 confidence의 evidence만 반환하세요.
- 청년/사업/교육이라는 단어만 보고 연령, 혜택, 신청방법을 추론하지 마세요.`

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 1000,
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
    parsed.officialLink = officialLink

    await writePosterFieldEvidence(typeof posterId === "string" ? posterId : null, parsed)

    return new Response(JSON.stringify({
      title: parsed.title ?? null,
      sourceOrgName: parsed.sourceOrgName ?? null,
      categoryId: parsed.categoryId ?? null,
      appEndAt: parsed.appEndAt ?? null,
      summaryShort: parsed.summaryShort ?? null,
      officialLink,
      fieldEvidence: parsed.fieldEvidence ?? [],
      unresolved: parsed.unresolved ?? [],
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
