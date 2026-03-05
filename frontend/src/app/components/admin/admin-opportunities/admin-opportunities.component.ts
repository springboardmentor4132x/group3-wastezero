import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OpportunityService } from '../../../services/opportunity.service';
import { ApplicationService } from '../../../services/application.service';
import { AuthService } from '../../../services/auth.service';
import { SocketService } from '../../../services/socket.service';
import { Opportunity, Application } from '../../../models/models';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-admin-opportunities',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-opportunities.component.html',
})
export class AdminOpportunitiesComponent implements OnInit, OnDestroy {
  // ── Tab control ──
  activeTab: 'list' | 'create' | 'edit' | 'applications' = 'list';

  // ── Opportunity list ──
  opportunities: Opportunity[] = [];
  loading = true;
  currentPage = 1;
  totalPages = 1;
  total = 0;
  filterStatus = '';
  successMsg = '';
  errorMsg = '';

  // ── Create / Edit form ──
  form = this.emptyForm();
  formErrors: string[] = [];
  saving = false;
  editingId: string | null = null;

  // ── Skill input helper ──
  newSkill = '';

  // ── Application management ──
  selectedOppForApps: Opportunity | null = null;
  applications: Application[] = [];
  appsLoading = false;
  decidingId: string | null = null;

  private subs: Subscription[] = [];

  constructor(
    public auth: AuthService,
    private oppService: OpportunityService,
    private appService: ApplicationService,
    private socketService: SocketService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.loadOpportunities();

    // Real-time: refresh when new applications arrive or opportunities change
    this.subs.push(
      this.socketService.on('application:created').subscribe(() => {
        this.loadOpportunities();
        if (this.selectedOppForApps) this.openApplications(this.selectedOppForApps);
      }),
      this.socketService.on('opportunity:updated').subscribe(() => this.loadOpportunities()),
      this.socketService.on('opportunity:deleted').subscribe(() => this.loadOpportunities()),
    );
  }

  ngOnDestroy() {
    this.subs.forEach((s) => s.unsubscribe());
  }

  // ─── Opportunity CRUD ─────────────────────────────────────────────────

  loadOpportunities() {
    this.loading = true;
    this.oppService
      .list({
        page: this.currentPage,
        limit: 12,
        mine: true,
        status: this.filterStatus || undefined,
      })
      .subscribe({
        next: (data) => {
          this.opportunities = data.opportunities;
          this.totalPages = data.pages;
          this.total = data.total;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.errorMsg = err.error?.message || 'Failed to load';
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  goToPage(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.loadOpportunities();
  }

  filterByStatus() {
    this.currentPage = 1;
    this.loadOpportunities();
  }

  openCreate() {
    this.form = this.emptyForm();
    this.editingId = null;
    this.formErrors = [];
    this.activeTab = 'create';
  }

  openEdit(opp: Opportunity) {
    this.editingId = opp._id;
    this.form = {
      title: opp.title,
      description: opp.description,
      requiredSkills: [...opp.requiredSkills],
      duration: opp.duration,
      location: opp.location,
      status: opp.status,
    };
    this.formErrors = [];
    this.activeTab = 'edit';
  }

  saveOpportunity() {
    this.formErrors = [];
    if (!this.form.title.trim()) this.formErrors.push('Title is required');
    if (!this.form.description.trim()) this.formErrors.push('Description is required');
    if (this.form.requiredSkills.length === 0) this.formErrors.push('At least one skill is required');
    if (!this.form.duration.trim()) this.formErrors.push('Duration is required');
    if (!this.form.location.trim()) this.formErrors.push('Location is required');
    if (this.formErrors.length) return;

    this.saving = true;
    const payload = { ...this.form };

    const obs$ = this.editingId
      ? this.oppService.update(this.editingId, payload)
      : this.oppService.create(payload);

    obs$.subscribe({
      next: () => {
        this.successMsg = this.editingId ? 'Opportunity updated!' : 'Opportunity created!';
        this.saving = false;
        this.activeTab = 'list';
        this.loadOpportunities();
        this.cdr.markForCheck();
        setTimeout(() => { this.successMsg = ''; this.cdr.markForCheck(); }, 4000);
      },
      error: (err) => {
        this.formErrors = [err.error?.message || 'Save failed'];
        if (err.error?.details) this.formErrors = err.error.details;
        this.saving = false;
        this.cdr.markForCheck();
      },
    });
  }

  deleteOpportunity(opp: Opportunity) {
    if (!confirm(`Delete "${opp.title}"? This is a soft delete.`)) return;
    this.oppService.delete(opp._id).subscribe({
      next: () => {
        this.successMsg = 'Opportunity deleted';
        this.loadOpportunities();
        this.cdr.markForCheck();
        setTimeout(() => { this.successMsg = ''; this.cdr.markForCheck(); }, 4000);
      },
      error: (err) => {
        this.errorMsg = err.error?.message || 'Delete failed';
        this.cdr.markForCheck();
      },
    });
  }

  // ─── Skill helpers ────────────────────────────────────────────────────

  addSkill() {
    const s = this.newSkill.trim();
    if (s && !this.form.requiredSkills.includes(s)) {
      this.form.requiredSkills.push(s);
    }
    this.newSkill = '';
  }

  removeSkill(index: number) {
    this.form.requiredSkills.splice(index, 1);
  }

  onSkillKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addSkill();
    }
  }

  // ─── Application management ──────────────────────────────────────────

  openApplications(opp: Opportunity) {
    this.selectedOppForApps = opp;
    this.activeTab = 'applications';
    this.loadApplications(opp._id);
  }

  loadApplications(oppId: string) {
    this.appsLoading = true;
    this.appService.listForOpportunity(oppId, { limit: 50 }).subscribe({
      next: (data) => {
        this.applications = data.applications;
        this.appsLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.errorMsg = err.error?.message || 'Failed to load applications';
        this.appsLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  decide(app: Application, decision: 'accepted' | 'rejected') {
    this.decidingId = app._id;
    this.appService.decide(app._id, decision).subscribe({
      next: (updated) => {
        // Update in-place
        const idx = this.applications.findIndex((a) => a._id === app._id);
        if (idx > -1) this.applications[idx] = updated;
        this.decidingId = null;
        this.successMsg = `Application ${decision}`;
        this.cdr.markForCheck();
        setTimeout(() => { this.successMsg = ''; this.cdr.markForCheck(); }, 4000);
      },
      error: (err) => {
        this.errorMsg = err.error?.message || 'Decision failed';
        this.decidingId = null;
        this.cdr.markForCheck();
      },
    });
  }

  getVolunteerName(app: Application): string {
    const v = app.volunteer_id;
    return typeof v === 'object' && v ? (v as any).name : '';
  }

  getVolunteerEmail(app: Application): string {
    const v = app.volunteer_id;
    return typeof v === 'object' && v ? (v as any).email : '';
  }

  getVolunteerSkills(app: Application): string[] {
    const v = app.volunteer_id;
    return typeof v === 'object' && v ? (v as any).skills || [] : [];
  }

  backToList() {
    this.activeTab = 'list';
    this.editingId = null;
    this.selectedOppForApps = null;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private emptyForm() {
    return {
      title: '',
      description: '',
      requiredSkills: [] as string[],
      duration: '',
      location: '',
      status: 'open' as 'open' | 'in-progress' | 'closed',
    };
  }

  statusBadgeClass(status: string): string {
    switch (status) {
      case 'open': return 'bg-success';
      case 'in-progress': return 'bg-warning text-dark';
      case 'closed': return 'bg-secondary';
      default: return 'bg-light text-dark';
    }
  }

  appStatusBadge(status: string): string {
    switch (status) {
      case 'pending': return 'bg-warning text-dark';
      case 'accepted': return 'bg-success';
      case 'rejected': return 'bg-danger';
      default: return 'bg-light text-dark';
    }
  }

  trackById(_: number, item: any): string { return item?._id || _; }
}
