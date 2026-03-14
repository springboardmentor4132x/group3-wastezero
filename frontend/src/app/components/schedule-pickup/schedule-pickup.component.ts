import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PickupService } from '../../services/pickup.service';

@Component({
  selector: 'app-schedule-pickup',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './schedule-pickup.component.html',
})
export class SchedulePickupComponent {
  loading = false;
  successMsg = '';
  errorMsg = '';

  form = {
    title: '',
    wasteType: '',
    description: '',
    estimatedQuantity: '',
    address: '',
    preferredDate: '',
    preferredTime: '',
    contactDetails: '',
    latitude: '' as number | string,
    longitude: '' as number | string,
  };

  wasteTypes = ['Plastic', 'Organic', 'E-Waste', 'Metal', 'Paper', 'Glass', 'Other'];

  constructor(private pickupService: PickupService, private router: Router) {}

  onSubmit() {
    this.errorMsg = '';
    this.successMsg = '';
    const { title, wasteType, estimatedQuantity, address, preferredDate, preferredTime } = this.form;
    if (!title || !wasteType || !estimatedQuantity || !address || !preferredDate || !preferredTime) {
      this.errorMsg = 'Please fill all required fields.';
      return;
    }
    this.loading = true;
    this.pickupService.createPickup(this.form).subscribe({
      next: () => {
        this.loading = false;
        this.successMsg = 'Pickup scheduled successfully! Volunteers will be notified.';
        setTimeout(() => this.router.navigate(['/my-pickups']), 1500);
      },
      error: (err) => {
        this.loading = false;
        this.errorMsg = err.error?.message || 'Failed to schedule pickup.';
      },
    });
  }

  reset() {
    this.form = { 
      title: '', wasteType: '', description: '', estimatedQuantity: '', 
      address: '', preferredDate: '', preferredTime: '', contactDetails: '',
      latitude: '', longitude: ''
    };
    this.errorMsg = '';
    this.successMsg = '';
  }

  getLocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.form.latitude = position.coords.latitude;
          this.form.longitude = position.coords.longitude;
        },
        (error) => {
          this.errorMsg = 'Could not get location. You can enter coordinates manually or leave them blank.';
        }
      );
    } else {
      this.errorMsg = 'Geolocation is not supported by this browser.';
    }
  }

  trackById(_: number, item: any): string { return item?._id || item?.id || _; }
  trackByIndex(i: number): number { return i; }
}