import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateScore } from '../dist/scoring.js';

test('Scoring Engine - All Passing Checks produces Grade A', () => {
  const checks = [
    { id: '1', name: 'Check 1', dimension: 'discovery', status: 'PASS', score: 20, maxScore: 20, message: 'ok' },
    { id: '2', name: 'Check 2', dimension: 'entityGraph', status: 'PASS', score: 20, maxScore: 20, message: 'ok' },
    { id: '3', name: 'Check 3', dimension: 'intentAndOffers', status: 'PASS', score: 20, maxScore: 20, message: 'ok' },
    { id: '4', name: 'Check 4', dimension: 'machinePayments', status: 'PASS', score: 20, maxScore: 20, message: 'ok' },
    { id: '5', name: 'Check 5', dimension: 'aiCrawlerAccess', status: 'PASS', score: 20, maxScore: 20, message: 'ok' },
  ];

  const score = calculateScore(checks);
  assert.equal(score.totalScore, 100);
  assert.equal(score.grade, 'A');
  assert.equal(score.machineTrustIndex, 1.0);
});

test('Scoring Engine - All Failing Checks produces Grade F', () => {
  const checks = [
    { id: '1', name: 'Check 1', dimension: 'discovery', status: 'FAIL', score: 0, maxScore: 20, message: 'failed' },
    { id: '2', name: 'Check 2', dimension: 'entityGraph', status: 'FAIL', score: 0, maxScore: 20, message: 'failed' },
    { id: '3', name: 'Check 3', dimension: 'intentAndOffers', status: 'FAIL', score: 0, maxScore: 20, message: 'failed' },
    { id: '4', name: 'Check 4', dimension: 'machinePayments', status: 'FAIL', score: 0, maxScore: 20, message: 'failed' },
    { id: '5', name: 'Check 5', dimension: 'aiCrawlerAccess', status: 'FAIL', score: 0, maxScore: 20, message: 'failed' },
  ];

  const score = calculateScore(checks);
  assert.equal(score.totalScore, 0);
  assert.equal(score.grade, 'F');
  assert.equal(score.machineTrustIndex, 0.0);
});
