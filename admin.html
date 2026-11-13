// GitHub에 식당 추가 (단건 + 일괄)
export default async function handler(req, res) {
  const token = req.headers['x-admin-token'];
  if (!token) {
    return res.status(401).json({ error: '인증 필요' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO = 'yeouidoeat/cafeteria-map';
  const FILE_PATH = 'index.html';
  
  if (!GITHUB_TOKEN) {
    return res.status(500).json({ error: 'GITHUB_TOKEN 미설정' });
  }

  // 단건 또는 일괄 처리
  let cafeterias = [];
  const { single, bulk } = req.body;
  
  if (bulk && Array.isArray(bulk)) {
    cafeterias = bulk;
  } else if (single) {
    cafeterias = [single];
  } else {
    // Legacy: body itself is a single cafeteria
    cafeterias = [req.body];
  }
  
  if (cafeterias.length === 0) {
    return res.status(400).json({ error: '등록할 식당 없음' });
  }

  try {
    // 1. 현재 index.html 가져오기
    const getRes = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    if (!getRes.ok) {
      const errData = await getRes.json();
      return res.status(500).json({ error: 'GitHub 파일 조회 실패: ' + errData.message });
    }

    const fileData = await getRes.json();
    const currentContent = Buffer.from(fileData.content, 'base64').toString('utf-8');

    // 2. cafeteriasData 배열 찾기
    const arrayStart = currentContent.indexOf('const cafeteriasData = [');
    if (arrayStart === -1) {
      return res.status(500).json({ error: 'cafeteriasData 배열을 찾을 수 없음' });
    }

    // 다음 식당 ID 계산 (가장 큰 id + 1)
    const idMatches = currentContent.match(/id:\s*(\d+)/g);
    let nextId = 1;
    if (idMatches) {
      const ids = idMatches.map(m => parseInt(m.match(/\d+/)[0]));
      nextId = Math.max(...ids) + 1;
    }

    // 3. 각 식당을 cafeteriasData 형식으로 변환
    const newEntries = cafeterias.map((cafe, idx) => {
      const id = nextId + idx;
      const external = cafe.external_available || cafe.external || 'unknown';
      const externalBool = external === '가능';
      
      return `    {
      id: ${id},
      name: ${JSON.stringify(cafe.name || '')},
      address: ${JSON.stringify(cafe.address || '')},
      lat: ${cafe.lat || 0},
      lng: ${cafe.lng || 0},
      price: ${cafe.price || 0},
      hours: ${JSON.stringify(cafe.hours || '')},
      menuType: ${JSON.stringify(cafe.menu_type || 'none')},
      menuUrl: ${JSON.stringify(cafe.menu_url || '')},
      externalAvailable: ${externalBool}
    }`;
    }).join(',\n');

    // 4. 배열 끝에 추가 (마지막 ] 전에)
    // cafeteriasData 배열의 닫는 ]를 찾아야 함
    // 간단한 접근: const cafeteriasData = [ ... ]; 패턴 매칭
    const regex = /const cafeteriasData = \[([\s\S]*?)\n\s*\];/;
    const match = currentContent.match(regex);
    
    if (!match) {
      return res.status(500).json({ error: 'cafeteriasData 배열 패턴을 찾을 수 없음' });
    }
    
    const oldArrayContent = match[1];
    // 마지막 요소 뒤에 comma 추가
    const trimmedOld = oldArrayContent.trimEnd();
    const needsComma = !trimmedOld.endsWith(',');
    const separator = needsComma ? ',\n' : '\n';
    
    const newArrayContent = oldArrayContent + separator + newEntries;
    const newFileContent = currentContent.replace(
      regex,
      `const cafeteriasData = [${newArrayContent}\n  ];`
    );

    // 5. GitHub에 커밋
    const commitMessage = cafeterias.length === 1 
      ? `Add cafeteria: ${cafeterias[0].name}`
      : `Add ${cafeterias.length} cafeterias (bulk)`;

    const updateRes = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: commitMessage,
          content: Buffer.from(newFileContent, 'utf-8').toString('base64'),
          sha: fileData.sha
        })
      }
    );

    if (!updateRes.ok) {
      const errData = await updateRes.json();
      return res.status(500).json({ error: 'GitHub 커밋 실패: ' + errData.message });
    }

    const result = await updateRes.json();
    return res.status(200).json({ 
      success: true, 
      count: cafeterias.length,
      startId: nextId,
      commit: result.commit?.sha || ''
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
