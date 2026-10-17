"use client";

import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

interface EvaluationRadarChartProps {
  scores?: {
    legibility: number;       // 見やすさ
    stability: number;        // 文字と行の安定
    organization: number;     // まとまり
    spacing_and_margin: number; // 余白と干渉
  };
}

export default function EvaluationRadarChart({ scores }: EvaluationRadarChartProps) {
  const defaultScores = {
    legibility: 86,
    stability: 43,
    organization: 60,
    spacing_and_margin: 75,
  };

  const currentScores = scores || defaultScores;

  const data = [
    { subject: '見やすさ', score: currentScores.legibility, fullMark: 100 },
    { subject: '文字と行の安定', score: currentScores.stability, fullMark: 100 },
    { subject: 'まとまり', score: currentScores.organization, fullMark: 100 },
    { subject: '余白と干渉', score: currentScores.spacing_and_margin, fullMark: 100 },
  ];

  return (
    <div style={{ width: '100%', height: 350, padding: '10px', backgroundColor: '#ffffff', borderRadius: '12px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
          <PolarGrid stroke="#e2e8f0" />
          <PolarAngleAxis 
            dataKey="subject" 
            tick={{ fill: '#4a5568', fontSize: 12, fontWeight: '600' }} 
          />
          <PolarRadiusAxis 
            angle={45} 
            domain={[0, 100]} 
            tickCount={6} 
            stroke="#cbd5e1" 
            tick={{ fontSize: 9 }}
          />
          <Radar
            name="板書評価"
            dataKey="score"
            stroke="#0d9488"
            fill="#2dd4bf"
            fillOpacity={0.4}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}