import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { poster_id } = await req.json()
    if (!poster_id) {
      return new Response(JSON.stringify({ error: 'poster_id is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // 포스터 상태 확인
    const { data: poster, error: posterError } = await supabase
      .from('posters')
      .select('id, title, poster_status')
      .eq('id', poster_id)
      .single()

    if (posterError || !poster) {
      throw new Error(posterError?.message ?? 'Poster not found')
    }
    if (poster.poster_status !== 'published') {
      return new Response(JSON.stringify({ message: 'Poster is not published.', sentCount: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // new_match 알림 수신 대상 user_id 조회
    const { data: notifications, error: notifError } = await supabase
      .from('notifications')
      .select('user_id')
      .eq('type', 'new_match')
      .eq('target_id', poster_id)

    if (notifError) throw new Error(notifError.message)
    if (!notifications || notifications.length === 0) {
      return new Response(JSON.stringify({ message: 'No matching notifications found.', sentCount: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // expo_push_token 조회 (토큰 있는 사용자만)
    const userIds = notifications.map((n: { user_id: string }) => n.user_id)
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, expo_push_token')
      .in('id', userIds)
      .not('expo_push_token', 'is', null)

    if (profileError) throw new Error(profileError.message)
    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ message: 'No users with push token.', sentCount: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    let sentCount = 0
    for (const profile of profiles) {
      if (!profile.expo_push_token) continue

      const pushResponse = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          to: profile.expo_push_token,
          title: '🎯 새 포스터 알림',
          body: `관심 분야·지역에 새 포스터가 등록됐어요: ${poster.title}`,
          data: { posterId: poster_id },
        }),
      })

      if (pushResponse.ok) sentCount++
    }

    return new Response(JSON.stringify({ message: 'Push notifications sent.', sentCount }), {
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
