import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PickupService } from '../../../services/pickup.service';
import { Pickup } from '../../../models/models';

@Component({
  selector: 'app-admin-pickups',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-pickups.component.html',
})
export class AdminPickupsComponent implements OnInit {
  pickups: Pickup[] = [];
  loading = true;
  statusFilter = '';
  typeFilter = '';
  searchQuery = '';
  successMsg = '';
  errorMsg = '';
  wasteTypes = ['', 'Plastic', 'Organic', 'E-Waste', 'Metal', 'Paper', 'Glass', 'Other'];

  constructor(private pickupService: PickupService, private cdr: ChangeDetectorRef) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.pickupService.getAllPickups().subscribe({
      next: (data) => {
        // getAllPickups returns paginated { pickups, total } — extract the array
        this.pickups = data.pickups ?? data;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  get filtered(): Pickup[] {
    return this.pickups.filter(p => {
      const statusOk = !this.statusFilter || p.status === this.statusFilter;
      const typeOk = !this.typeFilter || p.wasteType === this.typeFilter;
      const searchOk = !this.searchQuery || p.title.toLowerCase().includes(this.searchQuery.toLowerCase());
      return statusOk && typeOk && searchOk;
    });
  }

  complete(id: string) {
    this.pickupService.completePickup(id).subscribe({
      next: () => { this.successMsg = 'Pickup marked as completed.'; this.load(); },
      error: (err) => { this.errorMsg = err.error?.message || 'Error'; },
    });
  }

  deletePickup(id: string) {
    if (!confirm('Delete this pickup? This cannot be undone.')) return;
    this.pickupService.deletePickup(id).subscribe({
      next: () => { this.successMsg = 'Pickup deleted.'; this.load(); },
      error: (err) => { this.errorMsg = err.error?.message || 'Error'; },
    });
  }

  cancel(id: string) {
    this.pickupService.cancelPickup(id).subscribe({
      next: () => { this.successMsg = 'Pickup cancelled.'; this.load(); },
      error: (err) => { this.errorMsg = err.error?.message || 'Error'; },
    });
  }

  getUser(p: Pickup): string { return typeof p.user_id === 'object' ? (p.user_id as any).name : ''; }
  getVolunteer(p: Pickup): string { return p.volunteer_id && typeof p.volunteer_id === 'object' ? (p.volunteer_id as any).name : 'Unassigned'; }

  trackById(_: number, item: any): string { return item?._id || item?.id || _; }
  trackByIndex(i: number): number { return i; }
}