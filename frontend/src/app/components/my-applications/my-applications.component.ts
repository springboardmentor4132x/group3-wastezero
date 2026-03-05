import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ApplicationService } from '../../services/application.service';
import { AuthService } from '../../services/auth.service';
import { SocketService } from '../../services/socket.service';
import { Application, Opportunity } from '../../models/models';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-my-applications',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './my-applications.component.html',
})
export class MyApplicationsComponent implements OnInit, OnDestroy {
  applications: Application[] = [];
  loading = true;
  errorMsg = '';

  filterStatus = '';
  currentPage = 1;
  totalPages = 1;
  total = 0;

  private subs: Subscription[] = [];

  constructor(
    public auth: AuthService,
    private appService: ApplicationService,
    private socketService: SocketService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.load();

    // Real-time: refresh when application decision arrives
    this.subs.push(
      this.socketService.on('application:updated').subscribe(() => this.load()),
      this.socketService.on('opportunity:updated').subscribe(() => this.load()),
      this.socketService.on('opportunity:deleted').subscribe(() => this.load()),
    );
  }

  ngOnDestroy() {
    this.subs.forEach((s) => s.unsubscribe());
  }

  load() {
    this.loading = true;
    this.appService
      .getMyApplications({
        page: this.currentPage,
        limit: 20,
        status: this.filterStatus || undefined,
      })
      .subscribe({
        next: (data) => {
          this.applications = data.applications;
          this.totalPages = data.pages;
          this.total = data.total;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.errorMsg = err.error?.message || 'Failed to load applications';
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  filterByStatus() {
    this.currentPage = 1;
    this.load();
  }

  goToPage(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.load();
  }

  getOppTitle(app: Application): string {
    const o = app.opportunity_id;
    return typeof o === 'object' && o ? (o as Opportunity).title : '';
  }

  getOppLocation(app: Application): string {
    const o = app.opportunity_id;
    return typeof o === 'object' && o ? (o as Opportunity).location : '';
  }

  getOppStatus(app: Application): string {
    const o = app.opportunity_id;
    return typeof o === 'object' && o ? (o as Opportunity).status : '';
  }

  statusBadge(status: string): string {
    switch (status) {
      case 'pending': return 'bg-warning text-dark';
      case 'accepted': return 'bg-success';
      case 'rejected': return 'bg-danger';
      default: return 'bg-light text-dark';
    }
  }

  trackById(_: number, item: any): string {
    return item?._id || _;
  }
}
