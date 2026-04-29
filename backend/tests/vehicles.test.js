const request = require('supertest');
const { app } = require('../server');

describe('Vehicles API', () => {
  test('GET /api/vehicles returns 200 and an array (or paginated object)', async () => {
    const res = await request(app).get('/api/vehicles').expect(200);
    const body = res.body;
    if (Array.isArray(body)) {
      expect(Array.isArray(body)).toBe(true);
    } else {
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
    }
  });

  test('POST /api/vehicles creates a vehicle', async () => {
    const payload = { marque: 'Peugeot', modele: '208', annee: '2020', immatriculation: `AA-${Date.now()}` };
    const res = await request(app).post('/api/vehicles').send(payload).expect(201);
    expect(res.body).toHaveProperty('id');
  });
});
