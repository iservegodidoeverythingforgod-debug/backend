import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role, OrderStatus } from '../common/enums';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.CUSTOMER, Role.USER)
  @ApiOperation({ summary: 'Create a new order from cart (Customer only)' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.create(userId, dto);
  }

  @Get('my-orders')
  @UseGuards(RolesGuard)
  @Roles(Role.CUSTOMER, Role.USER)
  @ApiOperation({ summary: 'List current customer orders (Customer only)' })
  async findMyOrders(@CurrentUser('id') userId: string) {
    return this.ordersService.findAllForUser(userId);
  }

  @Get('admin/all')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List all orders (Admin only)' })
  @ApiQuery({ name: 'status', enum: OrderStatus, required: false })
  async findAllAdmin(@Query('status') status?: OrderStatus) {
    return this.ordersService.findAllForAdmin(status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single order details' })
  async findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update order status (Admin only)' })
  async updateStatus(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, dto, adminId);
  }

  @Get(':id/receipt')
  @ApiOperation({ summary: 'Get dynamic receipt data for a paid order' })
  async getReceipt(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.getReceipt(id, user);
  }

  @Post(':id/send-receipt')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin approves & sends receipt email to customer' })
  async sendReceipt(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body('email') email?: string,
  ) {
    return this.ordersService.sendReceipt(id, adminId, email);
  }
}
