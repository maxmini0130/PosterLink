import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { imageBase64 } = await req.json()
    if (!imageBase64) throw new Error("Missing imageBase64 data.")

    // 실제로는 여기에 Google Vision API나 OpenAI GPT-4o-mini(Vision) 등을 호출합니다.
    // 여기서는 테스트를 위해 시뮬레이션 데이터를 반환하거나 간단한 로직을 구성합니다.
    
    // [OCR 시뮬레이션 로직]
    // 1. 이미지를 분석하여 텍스트를 추출 (가상)
    // 2. 추출된 텍스트에서 제목, 기관, 날짜를 정규표현식이나 LLM으로 분류 (가상)
    
    // 시뮬레이션 응답 데이터
    const ocrResult = {
      title: "제3회 전국 청소년 창업 공모전",
      sourceOrgName: "한국창업지원재단",
      categoryId: "competition", // 카테고리 코드 또는 ID 추측
      appEndAt: "2026-05-30",
      summaryShort: "청소년들의 창의적인 아이디어를 발굴하고 사업화를 지원하는 공모전입니다.",
      officialLink: "https://startup.or.kr/contest/3"
    }

    // 인공적인 딜레이 (분석 시간 시뮬레이션)
    await new Promise(resolve => setTimeout(resolve, 2000))

    return new Response(JSON.stringify(ocrResult), {
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
