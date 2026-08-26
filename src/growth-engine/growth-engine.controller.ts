import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { GrowthEngineService, SimulationResult } from './growth-engine.service';
import {
  CreateGrowthRuleDto,
  UpdateGrowthRuleDto,
  CreateGrowthStageDto,
  UpdateGrowthStageDto,
  CreateGrowthConditionDto,
  UpdateGrowthConditionDto,
  SimulateGrowthDto,
} from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Role } from '../common/enums';
import { memoryStorage } from 'multer';

@ApiTags('Plant Growth Simulation Engine (Rule-based State Machine)')
@Controller()
export class GrowthEngineController {
  constructor(private readonly growthEngineService: GrowthEngineService) {}

  // ===========================================================================
  // SIMULATION ENDPOINTS
  // ===========================================================================

  @Public()
  @Post('products/:id/simulate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Simulate plant growth for a product using its linked GrowthRule (Public/Customer)',
  })
  async simulateProduct(
    @Param('id') productId: string,
    @Body() dto: SimulateGrowthDto,
  ): Promise<SimulationResult> {
    return this.growthEngineService.simulateProduct(productId, dto);
  }

  @Public()
  @Post('growth-engine/simulate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Directly execute rule-based plant growth simulation (Public/Customer)',
  })
  async simulateDirect(@Body() dto: SimulateGrowthDto): Promise<SimulationResult> {
    return this.growthEngineService.simulateDirect(dto);
  }

  // ===========================================================================
  // GROWTH RULES MANAGEMENT (Admin Authoring)
  // ===========================================================================

  @Public()
  @Get('growth-engine/rules')
  @ApiOperation({ summary: 'List all botanical growth simulation rules with stages' })
  async findAllRules() {
    return this.growthEngineService.findAllRules();
  }

  @Public()
  @Get('growth-engine/rules/:id')
  @ApiOperation({ summary: 'Get a growth rule with all stages and conditions' })
  async findRuleById(@Param('id') id: string) {
    return this.growthEngineService.findRuleById(id);
  }

  @Post('growth-engine/rules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new botanical growth rule model (Admin only)' })
  async createRule(@Body() dto: CreateGrowthRuleDto) {
    return this.growthEngineService.createRule(dto);
  }

  @Put('growth-engine/rules/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a growth rule model (Admin only)' })
  async updateRule(@Param('id') id: string, @Body() dto: UpdateGrowthRuleDto) {
    return this.growthEngineService.updateRule(id, dto);
  }

  @Delete('growth-engine/rules/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a growth rule model (Admin only)' })
  async deleteRule(@Param('id') id: string) {
    return this.growthEngineService.deleteRule(id);
  }

  // ===========================================================================
  // STAGES AUTHORING (Admin)
  // ===========================================================================

  @Post('growth-engine/rules/:ruleId/stages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a stage to a growth rule (Admin only)' })
  async addStage(@Param('ruleId') ruleId: string, @Body() dto: CreateGrowthStageDto) {
    return this.growthEngineService.addStage(ruleId, dto);
  }

  @Put('growth-engine/stages/:stageId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a growth stage (Admin only)' })
  async updateStage(@Param('stageId') stageId: string, @Body() dto: UpdateGrowthStageDto) {
    return this.growthEngineService.updateStage(stageId, dto);
  }

  @Delete('growth-engine/stages/:stageId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a growth stage (Admin only)' })
  async deleteStage(@Param('stageId') stageId: string) {
    return this.growthEngineService.deleteStage(stageId);
  }

  // ===========================================================================
  // DYNAMIC CONDITIONS AUTHORING (Admin)
  // ===========================================================================

  @Post('growth-engine/stages/:stageId/conditions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a dynamic condition with inputs & rules to a stage (Admin only)' })
  async addCondition(
    @Param('stageId') stageId: string,
    @Body() dto: CreateGrowthConditionDto,
  ) {
    return this.growthEngineService.addCondition(stageId, dto);
  }

  @Put('growth-engine/conditions/:conditionId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update dynamic condition rules and outputs (Admin only)' })
  async updateCondition(
    @Param('conditionId') conditionId: string,
    @Body() dto: UpdateGrowthConditionDto,
  ) {
    return this.growthEngineService.updateCondition(conditionId, dto);
  }

  @Delete('growth-engine/conditions/:conditionId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a condition from a stage (Admin only)' })
  async deleteCondition(@Param('conditionId') conditionId: string) {
    return this.growthEngineService.deleteCondition(conditionId);
  }

  // ===========================================================================
  // ANIMATION ASSETS MANAGEMENT
  // ===========================================================================

  @Post('growth-engine/animations/upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload animation asset (Lottie/JSON/GIF/video) (Admin only)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        name: { type: 'string' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 3 * 1024 * 1024 }, // 3MB limit for animations
    }),
  )
  async uploadAnimation(
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name?: string,
  ) {
    return this.growthEngineService.uploadAnimation(name || file?.originalname, file);
  }

  @Post('animation-assets')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload animation asset (Lottie/JSON/GIF/video) (Admin only)' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 3 * 1024 * 1024 },
    }),
  )
  async uploadAnimationAsset(
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name?: string,
  ) {
    return this.growthEngineService.uploadAnimation(name || file?.originalname, file);
  }

  @Public()
  @Get('growth-engine/animations')
  @ApiOperation({ summary: 'List all uploaded animation assets' })
  async findAllAnimations() {
    return this.growthEngineService.findAllAnimations();
  }

  @Public()
  @Get('animation-assets')
  @ApiOperation({ summary: 'List all uploaded animation assets' })
  async findAllAnimationAssets() {
    return this.growthEngineService.findAllAnimations();
  }

  @Delete('growth-engine/animations/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete an animation asset (Admin only)' })
  async deleteAnimation(@Param('id') id: string) {
    return this.growthEngineService.deleteAnimation(id);
  }

  @Delete('animation-assets/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete an animation asset (Admin only)' })
  async deleteAnimationAsset(@Param('id') id: string) {
    return this.growthEngineService.deleteAnimation(id);
  }
}
