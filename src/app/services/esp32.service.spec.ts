import { TestBed } from '@angular/core/testing';

import { Esp32Service } from './esp32.service';

describe('Esp32Service', () => {
  let service: Esp32Service;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Esp32Service);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
