// Gemini AI로 식당 정보 조사 (Fallback 포함)
export default async function handler(req, res) {
  const token = req.headers['x-admin-token'];
  if (!token) {
    return res.status(401).json({ error: '인증 필요' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: '쿼리 필요' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY 미설정' });
  }

  // 시도할 모델 리스트 (순서대로)
  const MODELS = [
    'gemini-2.5-flash',
    'gemini-flash-latest',
    'gemini-pro-latest',
    'gemini-2.5-flash-lite',
    'gemini-3.8-flash'
  ];

  const prompt = `당신은 서울/경기 구내식당 정보 전문 조사원입니다.
다음 식당에 대해 조사해주세요: "${query}"

반드시 JSON 형식으로만 답변하세요. 다른 설명 없이 JSON만:
{
  "name": "정확한 식당 이름",
  "address": "도로명 주소 (서울특별시/경기도 포함)",
  "lat": 위도 숫자,
  "lng": 경도 숫자,
  "price": 가격 숫자 (원 단위, 모르면 0),
  "hours": "11:30~13:30 형식",
  "menu_type": "kakao" 또는 "insta" 또는 "url" 또는 "none",
  "menu_url": "식단표 URL 또는 빈 문자열",
  "external_available": "가능" 또는 "불가" 또는 "unknown",
  "confidence": 0~100 정수,
  "notes": "추가 정보나 주의사항"
}

정보가 불확실하면 confidence를 낮게 설정하고, 모르는 값은 null로 설정하세요.`;

  let lastError = '';
  
  // 각 모델 순서대로 시도
  for (const model of MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
          })
        }
      );

      const data = await response.json();

      if (data.error) {
        lastError = `${model}: ${data.error.message}`;
        continue; // 다음 모델 시도
      }

      if (!data.candidates || !data.candidates[0]) {
        lastError = `${model}: 응답 없음`;
        continue;
      }

      const text = data.candidates[0].content.parts[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        lastError = `${model}: JSON 파싱 실패`;
        continue;
      }

      const info = JSON.parse(jsonMatch[0]);
      return res.status(200).json({ 
        info, 
        used_model: model 
      });
      
    } catch (err) {
      lastError = `${model}: ${err.message}`;
      continue;
    }
  }

  // 모든 모델 실패
  return res.status(500).json({ 
    error: '모든 모델 실패. 마지막 에러: ' + lastError 
  });
}
