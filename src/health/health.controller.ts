import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('System Health & Monitoring')
@Controller()
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Health Check for Render & uptime monitors' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  async getHealth() {
    const isDbConnected = this.dataSource.isInitialized;
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'Online Seed & Herb Store API',
      database: isDbConnected ? 'connected' : 'disconnected',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
    };
  }
}
