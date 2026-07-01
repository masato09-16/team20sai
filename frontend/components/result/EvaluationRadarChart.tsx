"use client";

import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

interface EvaluationRadarChartProps {
  scores?: {
    readability: number;
    line_alignment: number;
    spacing_balance: number;
    stroke_quality: number;
    horizontalness: number;
    visibility: number;
  };
}

export default function EvaluationRadarChart({ scores }: EvaluationRadarChartProps) {
  const defaultScores = {
    readability: 74,
    line_alignment: 81,
    spacing_balance: 80,
    stroke_quality: 39,
    horizontalness: 87,
    visibility: 100,
  };

  const currentScores = scores || defaultScores;

  const data = [
    { subject: '読みやすさ', score: currentScores.readability, fullMark: 100 },
    { subject: '行の揃い方', score: currentScores.line_alignment, fullMark: 100 },
    { subject: '間隔の見やすさ', score: currentScores.spacing_balance, fullMark: 100 },
    { subject: '文字の整い', score: currentScores.stroke_quality, fullMark: 100 },
    { subject: '線の安定感', score: currentScores.horizontalness, fullMark: 100 },
    { subject: '撮影品質', score: currentScores.visibility, fullMark: 100 },
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
            angle={30} 
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