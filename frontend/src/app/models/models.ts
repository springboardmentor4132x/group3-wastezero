export interface User {
  _id: string;
  name: string;
  email: string;
  username: string;
  role: 'user' | 'volunteer' | 'admin';
  skills: string[];
  location: string;
  bio: string;
  phone: string;
  isActive: boolean;
  isSuspended: boolean;
  totalPickupsCompleted: number;
  wasteStats: WasteStats;
  createdAt: string;
  token?: string;
}

export interface WasteStats {
  plastic: number;
  organic: number;
  eWaste: number;
  metal: number;
  paper: number;
  glass: number;
  other: number;
}

export interface Pickup {
  _id: string;
  title: string;
  user_id: User | string;
  volunteer_id?: User | string | null;
  wasteType: 'Plastic' | 'Organic' | 'E-Waste' | 'Metal' | 'Paper' | 'Glass' | 'Other';
  description: string;
  estimatedQuantity: string;
  address: string;
  preferredDate: string;
  preferredTime: string;
  contactDetails: string;
  status: 'Open' | 'Accepted' | 'Completed' | 'Cancelled';
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  _id: string;
  sender_id: User | string;
  receiver_id: User | string;
  pickup_id?: string;
  content: string;
  isRead: boolean;
  timestamp: string;
}

export interface AdminStat {
  totalUsers: number;
  totalVolunteers: number;
  totalAdmins: number;
  totalPickups: number;
  completedPickups: number;
  pendingPickups: number;
  cancelledPickups: number;
  wasteByType: { _id: string; count: number }[];
  recentActivity: any[];
}

// ── Milestone 2: Opportunity & Application ────────────────────────────
export interface Opportunity {
  _id: string;
  title: string;
  description: string;
  requiredSkills: string[];
  duration: string;
  location: string;
  status: 'open' | 'in-progress' | 'closed';
  ngo_id: User | string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  imageUrl?: string;
}

export interface OpportunityPage {
  opportunities: Opportunity[];
  total: number;
  page: number;
  pages: number;
}

export interface Application {
  _id: string;
  opportunity_id: Opportunity | string;
  volunteer_id: User | string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationPage {
  applications: Application[];
  total: number;
  page: number;
  pages: number;
  opportunity?: { _id: string; title: string; status: string };
}
