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

    // 1. 내일 마감되는 포스터 조회 (application_end_at 기준)
    // 오늘 0시 기준, 내일 0시 ~ 모레 0시 사이인 경우
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const startOfTomorrow = new Date(tomorrow.setHours(0, 0, 0, 0)).toISOString();
    const endOfTomorrow = new Date(tomorrow.setHours(23, 59, 59, 999)).toISOString();

    const { data: expiringPosters, error: postersError } = await supabase
      .from('posters')
      .select('id, title, source_org_name')
      .gte('application_end_at', startOfTomorrow)
      .lte('application_end_at', endOfTomorrow)
      .eq('poster_status', 'published')

    if (postersError) throw postersError

    if (!expiringPosters || expiringPosters.length === 0) {
      return new Response(JSON.stringify({ message: "No posters expiring tomorrow." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const notificationsSent = []

    for (const poster of expiringPosters) {
      // 2. 해당 포스터를 찜한 사용자 및 그들의 푸시 토큰 조회
      const { data: favorites, error: favoritesError } = await supabase
        .from('poster_favorites')
        .select(`
          user_id,
          profiles:user_id (nickname, expo_push_token)
        `)
        .eq('poster_id', poster.id)

      if (favoritesError) continue

      for (const fav of favorites) {
        const profile = Array.isArray(fav.profiles) ? fav.profiles[0] : fav.profiles
        if (!profile) continue

        // 3. 알림 데이터베이스 삽입
        const { error: notifyError } = await supabase
          .from('notifications')
          .insert({
            user_id: fav.user_id,
            type: 'favorite_deadline',
            title: '⏰ 마감 임박 알림',
            body: `찜하신 [${poster.title}] 포스터가 내일 마감됩니다! 놓치지 마세요.`,
            target_type: 'poster',
            target_id: poster.id,
          })

        if (notifyError) {
          console.error('Notification insertion error:', notifyError)
        }

        // 4. Expo Push 알림 발송 (푸시 토큰이 있는 경우)
        if (profile.expo_push_token) {
          const pushResponse = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify({
              to: profile.expo_push_token,
              title: '⏰ 마감 임박 알림',
              body: `찜하신 [${poster.title}] 포스터가 내일 마감됩니다!`,
              data: { posterId: poster.id },
            }),
          })
          const pushResult = await pushResponse.json()
          notificationsSent.push({ userId: fav.user_id, pushResult })
        }
      }
    }

    return new Response(JSON.stringify({ message: "Deadline check complete.", sentCount: notificationsSent.length }), {
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
