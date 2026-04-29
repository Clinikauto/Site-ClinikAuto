const request = require('supertest');
const { app } = require('../server');

describe('Clients API', () => {
  test('GET /api/clients returns 200 and an array', async () => {
    const res = await request(app).get('/api/clients').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/clients creates a client', async () => {
    const payload = { nom: 'Test', prenom: 'User', email: `test.${Date.now()}@example.com` };
    const res = await request(app).post('/api/clients').send(payload).expect(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.email).toBe(payload.email);
  });
});
