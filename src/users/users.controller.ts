import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums';

@ApiTags('Admin User Management')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List all registered users (Admin only)' })
  @ApiQuery({ name: 'role', enum: Role, required: false })
  @ApiQuery({ name: 'search', required: false })
  async findAll(@Query('role') role?: Role, @Query('search') search?: string) {
    return this.usersService.findAll(role, search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user details by ID (Admin only)' })
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Activate or suspend user account (Admin only)' })
  async updateStatus(
    @Param('id') id: string,
    @Body('is_active') isActive: boolean,
  ) {
    return this.usersService.updateStatus(id, isActive);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: 'Promote or demote user role (Admin only)' })
  async updateRole(@Param('id') id: string, @Body('role') role: Role) {
    return this.usersService.updateRole(id, role);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete user account (Admin only)' })
  async remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
