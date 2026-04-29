const request = require('supertest');
const { app } = require('../server');

describe('Vehicles API', () => {
  test('GET /api/vehicles returns 200 and an array', async () => {
    const res = await request(app).get('/api/vehicles').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/vehicles creates a vehicle', async () => {
    const payload = { marque: 'Peugeot', modele: '208', annee: '2020', immatriculation: `AA-${Date.now()}` };
    const res = await request(app).post('/api/vehicles').send(payload).expect(201);
    expect(res.body).toHaveProperty('id');
  });
});
