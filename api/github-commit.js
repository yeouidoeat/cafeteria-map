// GitHub에 새 식당을 index.html에 자동 추가
export default async function handler(req, res) {
  // 인증 체크
  const token = req.headers['x-admin-token'];
  if (!token) {
    return res.status(401).json({ error: '인증 필요' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, address, price, hours, lat, lng, menuType, menuLink, keyword } = req.body;

  if (!name || !address || !lat || !lng) {
    return res.status(400).json({ error: '필수 정보 누락' });
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_REPO = process.env.GITHUB_REPO || 'yeouidoeat/cafeteria-map';
  const GITHUB_FILE = 'index.html';

  if (!GITHUB_TOKEN) {
    return res.status(500).json({ error: 'GITHUB_TOKEN 미설정' });
  }

  try {
    // 1. GitHub에서 index.html 가져오기
    const getRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    if (!getRes.ok) {
      const errText = await getRes.text();
      return res.status(500).json({ error: 'GitHub 파일 가져오기 실패: ' + errText });
    }

    const fileData = await getRes.json();
    const content = Buffer.from(fileData.content, 'base64').toString('utf-8');

    // 2. 최대 id 찾기
    const idMatches = content.match(/id:\s*(\d+)/g) || [];
    if (idMatches.length === 0) {
      return res.status(500).json({ error: 'id 패턴을 찾을 수 없음' });
    }
    const maxId = Math.max(...idMatches.map(m => parseInt(m.match(/\d+/)[0])));
    const newId = maxId + 1;

    // 3. 새 식당 코드 생성
    const menuPart = menuType && menuLink
      ? `, menuType:"${menuType}", menuLink:"${menuLink}"`
      : '';

    const priceStr = price ? price.toLocaleString() + '원' : '';
    const newLine = `  { id:${newId}, lat:${lat}, lng:${lng}, keyword:"${keyword || name}", name:"${name}", price:${price}, pl:"${priceStr}", crowd:55, open:true, hours:"${hours || ''}", address:"${address}"${menuPart} },`;

    // 4. ]; 앞에 삽입 (restaurants 배열 끝)
    const newContent = content.replace(/(\n)(\];)/, `\n${newLine}\n$2`);

    if (newContent === content) {
      return res.status(500).json({ error: '코드 삽입 위치(];)를 찾을 수 없음' });
    }

    // 5. GitHub에 커밋
    const putRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
          message: `신규 식당 추가: ${name} (id:${newId})`,
          content: Buffer.from(newContent, 'utf-8').toString('base64'),
          sha: fileData.sha
        })
      }
    );

    if (!putRes.ok) {
      const errData = await putRes.json();
      return res.status(500).json({ error: '커밋 실패: ' + (errData.message || putRes.status) });
    }

    return res.status(200).json({ success: true, newId, name });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
