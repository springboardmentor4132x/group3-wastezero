import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../services/admin.service';

@Component({
  selector: 'app-admin-reports',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-reports.component.html',
})
export class AdminReportsComponent implements OnInit {
  activeReport = 'users';
  loading = false;

  usersData: any[] = [];
  pickupsData: any[] = [];
  volunteersData: any[] = [];
  wasteData: any = {};
  logs: any[] = [];

  constructor(private adminService: AdminService, private cdr: ChangeDetectorRef) {}

  ngOnInit() { this.loadReport('users'); }

  loadReport(type: string) {
    this.activeReport = type;
    this.loading = true;
    switch (type) {
      case 'users':
        this.adminService.getUserReport().subscribe({ next: d => { this.usersData = d; this.loading = false; this.cdr.markForCheck(); }, error: () => { this.loading = false; } });
        break;
      case 'pickups':
        this.adminService.getPickupReport().subscribe({ next: d => { this.pickupsData = d; this.loading = false; this.cdr.markForCheck(); }, error: () => { this.loading = false; } });
        break;
      case 'waste':
        this.adminService.getWasteReport().subscribe({ next: d => { this.wasteData = d; this.loading = false; this.cdr.markForCheck(); }, error: () => { this.loading = false; } });
        break;
      case 'volunteers':
        this.adminService.getVolunteerReport().subscribe({ next: d => { this.volunteersData = d; this.loading = false; this.cdr.markForCheck(); }, error: () => { this.loading = false; } });
        break;
      case 'logs':
        this.adminService.getLogs().subscribe({ next: d => { this.logs = d; this.loading = false; this.cdr.markForCheck(); }, error: () => { this.loading = false; } });
        break;
    }
  }

  exportCSV(type: string) {
    let data: any[];
    let headers: string[];
    let filename: string;

    switch (type) {
      case 'users':
        data = this.usersData.map(u => ({ Name: u.name, Email: u.email, Username: u.username, Role: u.role, Location: u.location || '', Joined: new Date(u.createdAt).toLocaleDateString(), Status: u.isSuspended ? 'Suspended' : 'Active' }));
        headers = ['Name', 'Email', 'Username', 'Role', 'Location', 'Joined', 'Status'];
        filename = 'users_report';
        break;
      case 'pickups':
        data = this.pickupsData.map(p => ({ Title: p.title, User: typeof p.user_id === 'object' ? p.user_id.name : '', WasteType: p.wasteType, Address: p.address, Date: new Date(p.preferredDate).toLocaleDateString(), Status: p.status, Volunteer: p.volunteer_id && typeof p.volunteer_id === 'object' ? p.volunteer_id.name : 'Unassigned' }));
        headers = ['Title', 'User', 'WasteType', 'Address', 'Date', 'Status', 'Volunteer'];
        filename = 'pickups_report';
        break;
      case 'volunteers':
        data = this.volunteersData.map(v => ({ Name: v.name, Email: v.email, Location: v.location || '', AcceptedPickups: v.acceptedPickups, CompletedPickups: v.completedPickups, TotalCompleted: v.totalPickupsCompleted || 0 }));
        headers = ['Name', 'Email', 'Location', 'AcceptedPickups', 'CompletedPickups', 'TotalCompleted'];
        filename = 'volunteers_report';
        break;
      default:
        return;
    }

    const csvContent = [headers.join(','), ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  getUser(p: any): string { return typeof p.user_id === 'object' ? p.user_id.name : ''; }
  getVolunteer(p: any): string { return p.volunteer_id && typeof p.volunteer_id === 'object' ? p.volunteer_id.name : 'Unassigned'; }
  totalWaste(w: any): number { return w?.wasteByType?.reduce((a: number, b: any) => a + b.count, 0) || 0; }

  trackById(_: number, item: any): string { return item?._id || item?.id || _; }
  trackByIndex(i: number): number { return i; }
}