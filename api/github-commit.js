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

    // 2. cafeterias 배열 찾기 (실제 변수명!)
    const arrayMatch = currentContent.match(/const cafeterias = \[/);
    if (!arrayMatch) {
      return res.status(500).json({ error: 'cafeterias 배열을 찾을 수 없음' });
    }
    
    const arrayStart = arrayMatch.index;
    
    // 3. 배열의 끝 찾기 (중첩 괄호 고려)
    let bracketCount = 0;
    let arrayEnd = -1;
    let inString = false;
    let stringChar = null;
    let i = arrayStart + 'const cafeterias = '.length;
    
    for (; i < currentContent.length; i++) {
      const ch = currentContent[i];
      const prevCh = i > 0 ? currentContent[i-1] : '';
      
      // 문자열 안인지 확인
      if (!inString && (ch === '"' || ch === "'")) {
        inString = true;
        stringChar = ch;
        continue;
      }
      if (inString && ch === stringChar && prevCh !== '\\') {
        inString = false;
        stringChar = null;
        continue;
      }
      if (inString) continue;
      
      // 괄호 카운팅
      if (ch === '[') bracketCount++;
      if (ch === ']') {
        bracketCount--;
        if (bracketCount === 0) {
          arrayEnd = i;
          break;
        }
      }
    }
    
    if (arrayEnd === -1) {
      return res.status(500).json({ error: '배열 끝을 찾을 수 없음' });
    }

    // 4. 다음 식당 ID 계산
    const arrayContent = currentContent.substring(arrayStart, arrayEnd);
    const idMatches = arrayContent.match(/id:\s*(\d+)/g);
    let nextId = 1;
    if (idMatches) {
      const ids = idMatches.map(m => parseInt(m.match(/\d+/)[0]));
      nextId = Math.max(...ids) + 1;
    }

    // 5. 각 식당을 실제 형식으로 변환
    const newEntries = cafeterias.map((cafe, idx) => {
      const id = nextId + idx;
      const name = (cafe.name || '').replace(/"/g, '\\"');
      const address = (cafe.address || '').replace(/"/g, '\\"');
      const hours = (cafe.hours || '').replace(/"/g, '\\"');
      const keyword = (cafe.keyword || cafe.name || '').replace(/"/g, '\\"');
      const price = parseInt(cafe.price) || 0;
      const priceDisplay = price > 0 ? price.toLocaleString() + '원' : '';
      const menuType = cafe.menu_type || cafe.menuType || 'none';
      const menuLink = cafe.menu_url || cafe.menuLink || '';
      
      let entry = `  { id:${id}, lat:${cafe.lat || 0}, lng:${cafe.lng || 0}, keyword:"${keyword}", name:"${name}", price:${price}, pl:"${priceDisplay}", crowd:50, open:true, hours:"${hours}", address:"${address}"`;
      
      // menuType이 none이 아니면 추가
      if (menuType && menuType !== 'none' && menuLink) {
        entry += `, menuType:"${menuType}", menuLink:"${menuLink.replace(/"/g, '\\"')}"`;
      }
      
      entry += ` }`;
      return entry;
    }).join(',\n');

    // 6. 배열 끝 "];" 바로 앞에 삽입
    // 배열의 마지막 요소 뒤에 쉼표가 있는지 확인
    const beforeEnd = currentContent.substring(0, arrayEnd);
    const lastChar = beforeEnd.trimEnd().slice(-1);
    const needsComma = lastChar !== ',' && lastChar !== '[';
    
    const insertion = (needsComma ? ',\n' : '\n') + newEntries + '\n';
    
    const newFileContent = 
      currentContent.substring(0, arrayEnd) + 
      insertion +
      currentContent.substring(arrayEnd);

    // 7. GitHub에 커밋
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
