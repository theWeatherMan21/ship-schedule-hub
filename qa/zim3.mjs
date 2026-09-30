// ZIM 要 CountryCode。看抓包里真实请求的全部 query 参数
import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync('/Users/russospencer/Documents/trae_projects/ShipScheduleHub/docs/xhr-record.json', 'utf8'));
for (const x of (Array.isArray(d) ? d : (d.requests || []))) {
  if (!x || !x.u) continue;
  if ('PointToPoint/v2' in x.u || x.u.includes('PointToPoint')) {
    console.log('真实请求:', x.u);
    if (x.b) console.log('body:', x.b);
    break;
  }
}
