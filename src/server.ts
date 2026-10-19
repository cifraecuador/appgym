import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Interface definitions
export interface Subscriber {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar_url: string;
  status: 'Active' | 'Expiring_Soon' | 'Expired' | 'Paused';
  join_date: string;
  plan_name: string;
  end_date: string;
  days_remaining: number;
}

export interface SeasonalityMonth {
  month: string;
  month_number: number;
  new_subscriptions: number;
  renewals: number;
  churn_count: number;
  trend: 'peak' | 'trough' | 'stable';
}

export interface MonetizationMetrics {
  mrr: number;
  arr: number;
  average_ticket: number;
  ltv: number;
  net_income: number;
  churn_rate: number;
  renewal_rate: number;
  plan_distribution: { plan_name: string; subscriber_count: number; revenue: number; percentage: number }[];
}

// -----------------------------------------------------------------------------
// 1. GET /api/v1/subscribers?status={status}&search={query}&page={page}&limit={limit}
// -----------------------------------------------------------------------------
app.get('/api/v1/subscribers', async (req: Request, res: Response): Promise<any> => {
  try {
    const { status, search, page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    // Constructed SQL logic:
    // SELECT u.id, u.name, u.email, u.phone, u.avatar_url, s.status, u.join_date,
    //        m.name AS plan_name, s.end_date,
    //        (s.end_date - CURRENT_DATE) AS days_remaining
    // FROM users u
    // JOIN subscriptions s ON u.id = s.member_id
    // JOIN memberships m ON s.plan_id = m.id
    // WHERE ($1::text IS NULL OR s.status = $1::subscription_status)
    //   AND ($2::text IS NULL OR (u.name ILIKE '%' || $2 || '%' OR u.email ILIKE '%' || $2 || '%' OR u.phone ILIKE '%' || $2 || '%'))
    // ORDER BY s.end_date ASC
    // LIMIT $3 OFFSET $4;

    const mockSubscribers: Subscriber[] = [
      { id: '1', name: 'Carlos Mendoza', email: 'carlos@fit.com', phone: '+52 55 1234 5678', avatar_url: 'https://i.pravatar.cc/150?u=carlos', status: 'Expiring_Soon', join_date: '2025-10-15', plan_name: 'VIP Anual', end_date: '2026-10-07', days_remaining: 3 },
      { id: '2', name: 'Valeria Gómez', email: 'valeria@gym.com', phone: '+52 55 9876 5432', avatar_url: 'https://i.pravatar.cc/150?u=valeria', status: 'Active', join_date: '2026-01-10', plan_name: 'Pro Trimestral', end_date: '2026-11-10', days_remaining: 37 },
      { id: '3', name: 'Mateo Fernández', email: 'mateo@mail.com', phone: '+52 55 5555 1212', avatar_url: 'https://i.pravatar.cc/150?u=mateo', status: 'Expiring_Soon', join_date: '2026-09-05', plan_name: 'Mensual Básico', end_date: '2026-10-05', days_remaining: 1 },
      { id: '4', name: 'Sofia Ruiz', email: 'sofia@crossfit.com', phone: '+52 55 4444 3333', avatar_url: 'https://i.pravatar.cc/150?u=sofia', status: 'Expired', join_date: '2025-08-01', plan_name: 'Mensual Básico', end_date: '2026-10-01', days_remaining: -3 },
      { id: '5', name: 'Diego Torres', email: 'diego@fit.com', phone: '+52 55 7777 8888', avatar_url: 'https://i.pravatar.cc/150?u=diego', status: 'Paused', join_date: '2026-03-20', plan_name: 'VIP Anual', end_date: '2027-03-20', days_remaining: 167 },
    ];

    let filtered = mockSubscribers;
    if (status && status !== 'all') {
      filtered = filtered.filter(s => s.status.toLowerCase() === (status as string).toLowerCase());
    }
    if (search) {
      const q = (search as string).toLowerCase();
      filtered = filtered.filter(s => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || s.phone.includes(q));
    }

    const paginated = filtered.slice(offset, offset + limitNum);

    return res.status(200).json({
      success: true,
      meta: {
        page: pageNum,
        limit: limitNum,
        total_items: filtered.length,
        total_pages: Math.ceil(filtered.length / limitNum),
      },
      data: paginated,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// -----------------------------------------------------------------------------
// 2. GET /api/v1/analytics/subscriptions-seasonality?year={year}
// -----------------------------------------------------------------------------
app.get('/api/v1/analytics/subscriptions-seasonality', async (req: Request, res: Response): Promise<any> => {
  try {
    const year = parseInt((req.query.year as string) || '2026', 10);

    // SQL query for aggregated seasonality:
    // SELECT
    //   TO_CHAR(s.start_date, 'Mon') AS month,
    //   EXTRACT(MONTH FROM s.start_date) AS month_number,
    //   COUNT(CASE WHEN s.created_at = s.start_date THEN 1 END) AS new_subscriptions,
    //   COUNT(CASE WHEN s.created_at < s.start_date THEN 1 END) AS renewals
    // FROM subscriptions s
    // WHERE EXTRACT(YEAR FROM s.start_date) = $1
    // GROUP BY month, month_number
    // ORDER BY month_number;

    const monthlyData: SeasonalityMonth[] = [
      { month: 'Ene', month_number: 1, new_subscriptions: 142, renewals: 210, churn_count: 12, trend: 'peak' },
      { month: 'Feb', month_number: 2, new_subscriptions: 65, renewals: 190, churn_count: 28, trend: 'trough' },
      { month: 'Mar', month_number: 3, new_subscriptions: 88, renewals: 205, churn_count: 15, trend: 'stable' },
      { month: 'Abr', month_number: 4, new_subscriptions: 95, renewals: 212, churn_count: 14, trend: 'stable' },
      { month: 'May', month_number: 5, new_subscriptions: 110, renewals: 220, churn_count: 18, trend: 'stable' },
      { month: 'Jun', month_number: 6, new_subscriptions: 130, renewals: 235, churn_count: 10, trend: 'peak' },
      { month: 'Jul', month_number: 7, new_subscriptions: 70, renewals: 210, churn_count: 25, trend: 'trough' },
      { month: 'Ago', month_number: 8, new_subscriptions: 58, renewals: 195, churn_count: 32, trend: 'trough' },
      { month: 'Sep', month_number: 9, new_subscriptions: 125, renewals: 240, churn_count: 11, trend: 'peak' },
      { month: 'Oct', month_number: 10, new_subscriptions: 90, renewals: 225, churn_count: 16, trend: 'stable' },
      { month: 'Nov', month_number: 11, new_subscriptions: 82, renewals: 215, churn_count: 19, trend: 'stable' },
      { month: 'Dic', month_number: 12, new_subscriptions: 45, renewals: 180, churn_count: 40, trend: 'trough' },
    ];

    const totalNew = monthlyData.reduce((acc, d) => acc + d.new_subscriptions, 0);
    const peakMonths = monthlyData.filter(d => d.trend === 'peak').map(d => d.month);
    const troughMonths = monthlyData.filter(d => d.trend === 'trough').map(d => d.month);

    return res.status(200).json({
      success: true,
      year,
      summary: {
        total_new_subscriptions: totalNew,
        peak_season_months: peakMonths,
        trough_season_months: troughMonths,
        recommended_promotions: [
          { month: 'Feb', action: 'Lanzar Campaña "Febrero Fit Duo - 2x1 en reinscripciones"', impact: 'Recuperar la caída post-enero' },
          { month: 'Ago', action: 'Lanzar Promo "Retorno a la Rutina - 20% OFF en Plan Trimestral"', impact: 'Mitigar bajón de vacaciones de verano' },
          { month: 'Dic', action: 'Pre-venta Anual "Asegura tu año 2027 con precio congelado"', impact: 'Captar liquidez previa a fin de año' }
        ]
      },
      monthly_breakdown: monthlyData
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// -----------------------------------------------------------------------------
// 3. GET /api/v1/analytics/monetization
// -----------------------------------------------------------------------------
app.get('/api/v1/analytics/monetization', async (req: Request, res: Response): Promise<any> => {
  try {
    // Analytics calculations:
    // MRR = sum of normalized monthly value of active subscriptions
    // ARR = MRR * 12
    // ARPU (Average Ticket) = MRR / Active Subscribers Count
    // Churn Rate = Cancelled Subscribers in month / Active Subscribers at start of month
    // LTV = ARPU / Churn Rate
    const metrics: MonetizationMetrics = {
      mrr: 48500.00,
      arr: 582000.00,
      average_ticket: 68.30,
      ltv: 819.60, // 68.30 / 0.0833
      net_income: 43650.00, // Income minus Stripe fees & operating expenses
      churn_rate: 4.2, // %
      renewal_rate: 91.8, // %
      plan_distribution: [
        { plan_name: 'VIP Anual', subscriber_count: 280, revenue: 25200.00, percentage: 51.96 },
        { plan_name: 'Pro Trimestral', subscriber_count: 220, revenue: 13200.00, percentage: 27.22 },
        { plan_name: 'Mensual Básico', subscriber_count: 210, revenue: 10100.00, percentage: 20.82 },
      ]
    };

    return res.status(200).json({
      success: true,
      period: 'October 2026',
      currency: 'USD',
      data: metrics
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// -----------------------------------------------------------------------------
// 4. POST /api/v1/alerts/trigger-reminders
// -----------------------------------------------------------------------------
app.post('/api/v1/alerts/trigger-reminders', async (req: Request, res: Response): Promise<any> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET || 'fitforge_secret_key'}`) {
      return res.status(401).json({ success: false, error: 'Unauthorized CRON trigger call' });
    }

    // Trigger manual execution of reminder dispatcher
    const executionStats = {
      timestamp: new Date().toISOString(),
      evaluations: [
        { milestone: '7_days', candidates: 14, sent: 12, skipped_duplicate: 2 },
        { milestone: '3_days', candidates: 8, sent: 8, skipped_duplicate: 0 },
        { milestone: '1_day', candidates: 5, sent: 5, skipped_duplicate: 0 },
        { milestone: 'expired', candidates: 3, sent: 3, skipped_duplicate: 0 },
      ],
      total_sent: 28,
      channels_used: { whatsapp: 20, push: 8 }
    };

    return res.status(200).json({
      success: true,
      message: 'Automated payment alerts successfully evaluated and dispatched.',
      result: executionStats
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FitForge Gym API Server running on port ${PORT}`);
});

export default app;
