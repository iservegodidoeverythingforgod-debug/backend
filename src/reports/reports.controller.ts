import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums';

@ApiTags('Admin Analytics & Satisfaction Reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard-summary')
  @ApiOperation({ summary: 'Get overview dashboard metrics (Revenue, Orders, Products, Users)' })
  async getDashboardSummary() {
    return this.reportsService.getDashboardSummary();
  }

  @Get('top-products')
  @ApiOperation({ summary: 'Get top-selling seed and herb products' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getTopProducts(@Query('limit') limit?: number) {
    return this.reportsService.getTopProducts(limit ? Number(limit) : 5);
  }

  @Get('customer-satisfaction')
  @ApiOperation({ summary: 'Get customer satisfaction survey metrics and rating distribution' })
  async getCustomerSatisfaction() {
    return this.reportsService.getCustomerSatisfaction();
  }

  @Get('satisfaction')
  @ApiOperation({ summary: 'Get customer satisfaction survey metrics (alias)' })
  async getSatisfactionAlias() {
    return this.reportsService.getCustomerSatisfaction();
  }

  @Get('inventory-alerts')
  @ApiOperation({ summary: 'Get list of products with low inventory stock' })
  @ApiQuery({ name: 'threshold', required: false, type: Number })
  async getInventoryAlerts(@Query('threshold') threshold?: number) {
    return this.reportsService.getInventoryAlerts(threshold ? Number(threshold) : 15);
  }
}
