import React, { useEffect, useState } from "react";
import Papa from "papaparse";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
} from "chart.js";

ChartJS.register(
  Title,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement
);

const SymptomTrendChart = ({ symptom = "Fever" }) => {
  const [chartData, setChartData] = useState(null);

  useEffect(() => {
    fetch("/data/patients_symptoms_3500.csv")
      .then((res) => res.text())
      .then((csvText) => {
        const { data } = Papa.parse(csvText, { header: true });

        // Filter for the selected symptom
        const filteredCases = data.filter(
          (row) =>
            row.Symptom1?.toLowerCase().includes(symptom.toLowerCase()) ||
            row.Symptom2?.toLowerCase().includes(symptom.toLowerCase()) ||
            row.Symptom3?.toLowerCase().includes(symptom.toLowerCase())
        );

        // Convert SymptomDate to JS Date objects
        filteredCases.forEach(
          (row) => (row.SymptomDate = new Date(row.SymptomDate))
        );

        // Group counts by month
        const monthlyCounts = {};
        filteredCases.forEach((row) => {
          const monthKey = `${row.SymptomDate.getFullYear()}-${String(
            row.SymptomDate.getMonth() + 1
          ).padStart(2, "0")}`;
          monthlyCounts[monthKey] = (monthlyCounts[monthKey] || 0) + 1;
        });

        // Create full month range from first to last date
        const allDates = filteredCases.map((row) => row.SymptomDate);
        if (allDates.length === 0) return; // no data

        const minDate = new Date(Math.min(...allDates));
        const maxDate = new Date(
          Math.min(new Date("2025-08-26"), Math.max(...allDates))
        ); // cap at Aug 26 2025

        const labels = [];
        const dataPoints = [];
        let currentDate = new Date(
          minDate.getFullYear(),
          minDate.getMonth(),
          1
        );

        while (currentDate <= maxDate) {
          const key = `${currentDate.getFullYear()}-${String(
            currentDate.getMonth() + 1
          ).padStart(2, "0")}`;
          labels.push(key);
          dataPoints.push(monthlyCounts[key] || 0); // 0 if no cases

          // move to next month
          currentDate.setMonth(currentDate.getMonth() + 1);
        }

        setChartData({
          labels,
          datasets: [
            {
              label: `${symptom} Cases`,
              data: dataPoints,
              borderColor: "#3b82f6",
              backgroundColor: "#3b82f6",
              tension: 0.3,
              fill: false,
              pointRadius: 4,
            },
          ],
        });
      });
  }, [symptom]);

  const options = {
    responsive: true,
    plugins: {
      legend: { display: true },
      title: {
        display: true,
        text: `Monthly ${symptom} Cases Trend (Until Aug 2025)`,
      },
    },
    scales: {
      x: { title: { display: true, text: "Month" } },
      y: {
        title: { display: true, text: "Number of Cases" },
        beginAtZero: true,
      },
    },
  };

  if (!chartData) return <p>Loading chart...</p>;

  return <Line data={chartData} options={options} />;
};

export default SymptomTrendChart;
