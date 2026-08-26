import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Product Reviews & User Satisfaction')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER, Role.USER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit product review and satisfaction rating (Customer only)' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.create(userId, dto);
  }

  @Public()
  @Get('product/:productId')
  @ApiOperation({ summary: 'Get all reviews for a specific product' })
  async findByProduct(@Param('productId') productId: string) {
    return this.reviewsService.findByProduct(productId);
  }

  @Public()
  @Get('all')
  @ApiOperation({ summary: 'Get all store reviews' })
  async findAll() {
    return this.reviewsService.findAll();
  }

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all store reviews sorted chronologically (Oldest to Newest) (Admin only)' })
  async findAllAdmin() {
    return this.reviewsService.findAllForAdmin();
  }
}
