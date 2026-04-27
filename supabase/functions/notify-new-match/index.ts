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

    // 포스터 정보 조회
    const { data: poster, error: posterError } = await supabase
      .from('posters')
      .select('id, title, poster_status')
      .eq('id', poster_id)
      .single()

    if (posterError || !poster) throw posterError ?? new Error('Poster not found')
    if (poster.poster_status !== 'published') {
      return new Response(JSON.stringify({ message: 'Poster is not published.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // new_match 알림이 생성된 사용자 중 expo_push_token 보유자 조회
    const { data: notifications, error: notifError } = await supabase
      .from('notifications')
      .select(`
        user_id,
        profiles:user_id (expo_push_token)
      `)
      .eq('type', 'new_match')
      .eq('target_id', poster_id)

    if (notifError) throw notifError

    if (!notifications || notifications.length === 0) {
      return new Response(JSON.stringify({ message: 'No matching notifications found.', sentCount: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    let sentCount = 0
    for (const notif of notifications) {
      const profile = Array.isArray(notif.profiles) ? notif.profiles[0] : notif.profiles
      if (!profile?.expo_push_token) continue

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
