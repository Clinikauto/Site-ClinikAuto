const request = require('supertest');
const { app, startServer } = require('../server');
let server;

beforeAll(() => {
  server = startServer(0);
});

afterAll((done) => {
  server.close(done);
});

describe('Interventions API', () => {
  let createdId;

  test('POST /api/interventions -> 201', async () => {
    const res = await request(app).post('/api/interventions').send({ title: 'Test', description: 'desc' });
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('id');
    createdId = res.body.id;
  });

  test('GET /api/interventions/:id -> 200', async () => {
    const res = await request(app).get(`/api/interventions/${createdId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('title', 'Test');
  });

  test('PUT /api/interventions/:id -> 200', async () => {
    const res = await request(app).put(`/api/interventions/${createdId}`).send({ status: 'completed' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'completed');
  });

  test('DELETE /api/interventions/:id -> 200', async () => {
    const res = await request(app).delete(`/api/interventions/${createdId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('deleted');
  });
});
