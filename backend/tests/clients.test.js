const request = require('supertest');
const { app } = require('../server');

describe('Clients API', () => {
  test('GET /api/clients returns 200 and an array (or paginated object)', async () => {
    const res = await request(app).get('/api/clients').expect(200);
    // Accept either a plain array or a paginated object { data: [...] }
    const body = res.body;
    if (Array.isArray(body)) {
      expect(Array.isArray(body)).toBe(true);
    } else {
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
    }
  });

  test('POST /api/clients creates a client', async () => {
    const payload = { nom: 'Test', prenom: 'User', email: `test.${Date.now()}@example.com` };
    const res = await request(app).post('/api/clients').send(payload).expect(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.email).toBe(payload.email);
  });
});
