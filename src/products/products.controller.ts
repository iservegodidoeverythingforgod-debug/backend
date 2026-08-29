import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto';
import { BulkDeleteDto } from '../common/dto/bulk-delete.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Role } from '../common/enums';
import { SupabaseStorageService } from '../common/storage/supabase-storage.service';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';

@ApiTags('Seeds & Herbs Products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly supabaseStorageService: SupabaseStorageService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Browse seed & herb catalog with filters (Public)' })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'difficulty', required: false })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'order', enum: ['ASC', 'DESC'], required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
    @Query('difficulty') difficulty?: string,
    @Query('includeInactive') includeInactive?: boolean,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: 'ASC' | 'DESC',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : undefined;
    const limitNum = limit ? Math.max(1, parseInt(limit, 10) || 12) : undefined;

    return this.productsService.findAll({
      categoryId,
      search,
      difficulty,
      includeInactive: String(includeInactive) === 'true',
      sortBy,
      order,
      page: pageNum,
      limit: limitNum,
    });
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get seed/herb product details (Public)' })
  async findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a new seed/herb product (Admin only)' })
  async create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update seed/herb product (Admin only)' })
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a seed/herb product (Admin only)' })
  async remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }

  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bulk delete products and their media files (Admin only)' })
  async bulkRemove(
    @Body() dto: BulkDeleteDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.productsService.bulkRemove(dto.ids, adminId);
  }

  @Post('upload-image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload product thumbnail image to products bucket (Admin only)' })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 }, // 8MB limit for products bucket
    }),
  )
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }
    const ext = extname(file.originalname).toLowerCase() || '.jpg';
    const key = `${randomUUID()}${ext}`;
    const imageUrl = await this.supabaseStorageService.uploadFile(
      'products',
      key,
      file.buffer,
      file.mimetype || 'image/jpeg',
    );
    return {
      success: true,
      imageUrl,
    };
  }

  @Post(':id/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload gallery image for product into imgshot bucket (Admin only)' })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 }, // 8MB limit for imgshot bucket
    }),
  )
  async uploadGalleryImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }
    const ext = extname(file.originalname).toLowerCase() || '.jpg';
    const key = `${id}/${randomUUID()}${ext}`;
    const imageUrl = await this.supabaseStorageService.uploadFile(
      'imgshot',
      key,
      file.buffer,
      file.mimetype || 'image/jpeg',
    );
    const updatedProduct = await this.productsService.addGalleryImage(id, imageUrl);
    return {
      success: true,
      imageUrl,
      images: updatedProduct.images,
    };
  }

  @Delete(':id/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove gallery image from product (Admin only)' })
  async removeGalleryImage(
    @Param('id') id: string,
    @Body('imageUrl') bodyImageUrl?: string,
    @Query('imageUrl') queryImageUrl?: string,
  ) {
    const imageUrl = bodyImageUrl || queryImageUrl;
    if (!imageUrl) {
      throw new BadRequestException('imageUrl is required to remove gallery image');
    }
    return this.productsService.removeGalleryImage(id, imageUrl);
  }
}
