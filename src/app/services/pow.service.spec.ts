import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed, inject } from '@angular/core/testing';

import { PowService, workState } from './pow.service';
import { AppSettingsService } from './app-settings.service';

describe('PowService', () => {
  beforeEach(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
      providers: [PowService]
    });
  });

  it('should be created', inject([PowService], (service: PowService) => {
    expect(service).toBeTruthy();
  }));
  it('routes selected Twister32 proof of work to /pow rather than /proxy', inject(
    [PowService, AppSettingsService],
    async (service: PowService, settings: AppSettingsService) => {
      settings.settings.powSource = 'server';
      settings.settings.serverName = 'twister32-rsnano';
      const getHashServer = spyOn(service, 'getHashServer').and.returnValue(Promise.resolve('0000000000000001'));
      const hash = 'A'.repeat(64);

      const result = await service.getPow(hash, 1);
      expect(result.state).toBe(workState.success);
      expect(getHashServer).toHaveBeenCalledWith(hash, 1, 'https://twister32.changeip.net/pow');
    }
  ));

  it('leaves public, random, and custom work routing unchanged', inject(
    [PowService, AppSettingsService],
    async (service: PowService, settings: AppSettingsService) => {
      const getHashServer = spyOn(service, 'getHashServer').and.returnValue(Promise.resolve('0000000000000001'));
      settings.settings.powSource = 'server';
      for (const name of ['berrypay', 'random']) {
        settings.settings.serverName = name;
        const hash = (name === 'berrypay' ? 'B' : 'C').repeat(64);
        await service.getPow(hash, 1);
        expect(getHashServer).toHaveBeenCalledWith(hash, 1, '');
      }

      settings.settings.powSource = 'custom';
      settings.settings.serverName = 'twister32-rsnano';
      settings.settings.customWorkServer = 'https://twister32.changeip.net/pow';
      const hash = 'D'.repeat(64);
      await service.getPow(hash, 1);
      expect(getHashServer).toHaveBeenCalledWith(hash, 1, 'https://twister32.changeip.net/pow');
    }
  ));

});
