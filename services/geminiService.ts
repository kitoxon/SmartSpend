import { GoogleGenAI, Type } from "@google/genai";
import { Expense, SpendingInsight, Category, Debt, DebtForecast } from '../types';

const MODEL_NAME = "gemini-2.5-flash";

const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found");
  }
  return new GoogleGenAI({ apiKey });
};

export const analyzeSpendingHabits = async (expenses: Expense[]): Promise<SpendingInsight> => {
  const ai = getAIClient();
  
  // Simplify data for token efficiency
  const expenseSummary = expenses.slice(0, 50).map(e => ({
    amt: e.amount,
    cat: e.category,
    date: e.date.split('T')[0],
    desc: e.description
  }));

  const prompt = `Analyze this JSON expense data and provide financial insights.
  Data: ${JSON.stringify(expenseSummary)}
  
  Return a JSON object matching the schema provided. Focus on patterns, potential savings, and identify the top spending category.
  Estimate projected spending based on daily average if applicable.`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING, description: "A brief 1-2 sentence overview of spending." },
            topCategory: { type: Type.STRING, description: "The category with highest spend." },
            savingsTip: { type: Type.STRING, description: "Actionable advice to save money." },
            unusualSpending: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "List of outliers or high expenses." 
            },
            projectedEndOfMonth: { type: Type.NUMBER, description: "Estimated total spend by month end." }
          },
          required: ["summary", "topCategory", "savingsTip", "unusualSpending", "projectedEndOfMonth"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    return JSON.parse(text) as SpendingInsight;
  } catch (error) {
    console.error("AI Analysis failed:", error);
    throw error;
  }
};

export const suggestCategory = async (description: string): Promise<Category | null> => {
  const ai = getAIClient();
  
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Categorize the expense description "${description}" into one of these exact categories: ${Object.values(Category).join(', ')}. Return ONLY the category name.`,
      config: {
        maxOutputTokens: 20,
      }
    });

    const text = response.text?.trim();
    if (text && Object.values(Category).includes(text as Category)) {
      return text as Category;
    }
    return null;
  } catch (e) {
    console.warn("Auto-categorization failed", e);
    return null;
  }
};

export const analyzeDebtFreeDate = async (debts: Debt[], monthlyBudget: number): Promise<DebtForecast> => {
  const ai = getAIClient();

  const debtSummary = debts
    .filter(d => d.type === 'payable' && !d.isPaid)
    .map(d => ({
      lender: d.person,
      amount: d.amount,
      category: d.debtCategory,
      dueDate: d.dueDate
    }));

  const prompt = `
    I have these debts: ${JSON.stringify(debtSummary)}.
    I can commit to paying a TOTAL of ¥${monthlyBudget} per month towards these debts.
    
    Calculate/Provide:
    1. Estimated date I will be debt free.
    2. Confirm the recommended monthly total payment (should match my budget unless debts are lower).
    3. A strategy (Avalanche vs Snowball) explanation.
    4. A list of specific action steps (e.g., "Pay ¥X to Card A, Pay Minimum on Loan B").
  `;

  try {
     const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            estimatedDebtFreeDate: { type: Type.STRING, description: "Date string like 'October 2025'" },
            monthlyPaymentRecommendation: { type: Type.NUMBER, description: "Recommended total monthly payment" },
            strategy: { type: Type.STRING, description: "Name of strategy and brief why (e.g. Avalanche)" },
            interestWarning: { type: Type.STRING, description: "Warning about high interest debts if any" },
            actionPlan: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Specific ordered steps for the user to take."
            }
          },
          required: ["estimatedDebtFreeDate", "monthlyPaymentRecommendation", "strategy", "actionPlan"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    return JSON.parse(text) as DebtForecast;
  } catch (error) {
    console.error("Debt Analysis failed", error);
    throw error;
  }
}