import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 5,
  duration: '15s',
  thresholds: {
    checks: ['rate>0.99'],
    http_req_duration: ['p(95)<250'],
    http_req_failed: ['rate<0.01'],
  },
};

const baseUrl = __ENV.BASE_URL || 'http://127.0.0.1:3001';

export default function healthSmoke() {
  const response = http.get(`${baseUrl}/ready`);

  check(response, {
    'readiness returns 200': (result) => result.status === 200,
    'database is connected': (result) => result.json('database') === 'connected',
  });
}
