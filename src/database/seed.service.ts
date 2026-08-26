import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { Category } from './entities/category.entity';
import { Product } from './entities/product.entity';
import { GrowthRule } from './entities/growth-rule.entity';
import { GrowthStage } from './entities/growth-stage.entity';
import { GrowthCondition } from './entities/growth-condition.entity';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Payment } from './entities/payment.entity';
import { Review } from './entities/review.entity';
import { StoreSetting, PromptPayType } from './entities/store-setting.entity';
import { Role, OrderStatus, PaymentStatus } from '../common/enums';
import { DELETED_USER_ID, DELETED_USER_EMAIL, DELETED_USER_NAME } from '../common/constants';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(GrowthRule)
    private growthRuleRepository: Repository<GrowthRule>,
    @InjectRepository(GrowthStage)
    private growthStageRepository: Repository<GrowthStage>,
    @InjectRepository(GrowthCondition)
    private growthConditionRepository: Repository<GrowthCondition>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private orderItemRepository: Repository<OrderItem>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(Review)
    private reviewRepository: Repository<Review>,
    @InjectRepository(StoreSetting)
    private storeSettingRepository: Repository<StoreSetting>,
  ) {}

  async onApplicationBootstrap() {
    await this.seedData();
    await this.ensureGrowthRules();
    await this.ensureStoreSettings();
  }

  async ensureStoreSettings() {
    const existing = await this.storeSettingRepository.find({ take: 1 });
    if (existing.length === 0) {
      this.logger.log('Initializing default StoreSetting row...');
      const setting = this.storeSettingRepository.create({
        id: 'a0000000-0000-0000-0000-000000000001',
        promptpay_id: '0812345678',
        promptpay_type: PromptPayType.PHONE,
        account_name: 'Organic Seed & Herb Store Co., Ltd.',
      });
      await this.storeSettingRepository.save(setting);
    }
  }

  async ensureGrowthRules() {
    let defaultRule = await this.growthRuleRepository.findOne({
      where: { is_default: true },
      relations: ['stages', 'stages.conditions'],
    });

    if (!defaultRule) {
      this.logger.log('Creating standard default botanical GrowthRule...');
      defaultRule = this.growthRuleRepository.create({
        id: 'e0000000-0000-0000-0000-000000000001',
        name: 'Standard Botanical Growth Engine Model',
        description: 'Multi-stage agronomic rule engine with dynamic condition evaluation and decision support.',
        is_default: true,
        input_definitions: [
          { key: 'water', type: 'number' },
          { key: 'sunlight', type: 'number' },
          { key: 'temperature', type: 'number' },
          { key: 'ph', type: 'number' },
          { key: 'n', type: 'number' },
          { key: 'p', type: 'number' },
          { key: 'k', type: 'number' },
          { key: 'day', type: 'number' },
        ],
      });
      defaultRule = await this.growthRuleRepository.save(defaultRule);

      // Stage 1: Germination
      const stage1 = await this.growthStageRepository.save(
        this.growthStageRepository.create({
          id: 'e0000000-0000-0000-0000-000000000011',
          rule_id: defaultRule.id,
          stage_name: 'Germination & Sprout',
          stage_order: 1,
          animation: 'germination_sprout',
          min_day: 1,
          max_day: 7,
        }),
      );

      await this.growthConditionRepository.save([
        this.growthConditionRepository.create({
          stage_id: stage1.id,
          name: 'Moisture & Substrate Balance',
          condition_order: 1,
          inputs: ['water', 'ph'],
          rules: [
            {
              input: ['water', 'ph'],
              output: { rule: ['ph > water'], to: 'Soil pH exceeds hydration capacity', statusColor: '#FF9800' },
            },
            {
              input: ['water', 'ph'],
              output: { rule: ['water > ph'], to: 'Excessive water saturation increases seed rot risk', statusColor: '#FF9800' },
            },
            {
              input: ['water'],
              output: { rule: ['water < 30'], to: 'Seedbed is dry; sprout emergence delayed', statusColor: '#F44336' },
            },
            {
              input: ['water', 'ph'],
              output: { rule: ['otherwise'], to: 'Optimal moisture and pH for germination', statusColor: '#4CAF50' },
            },
          ],
          outputs: ['over_ph', 'over_water', 'underwatered', 'optimal'],
        }),
        this.growthConditionRepository.create({
          stage_id: stage1.id,
          name: 'Sprouting Temperature',
          condition_order: 2,
          inputs: ['temperature'],
          rules: [
            {
              input: ['temperature'],
              output: { rule: ['temperature > 35'], to: 'Excessive heat causes embryonic desiccation', statusColor: '#F44336' },
            },
            {
              input: ['temperature'],
              output: { rule: ['temperature < 18'], to: 'Low temperature induces seed dormancy', statusColor: '#FF9800' },
            },
            {
              input: ['temperature'],
              output: { rule: ['otherwise'], to: 'Ideal sprout temperature', statusColor: '#4CAF50' },
            },
          ],
          outputs: ['too_hot', 'too_cold', 'optimal'],
        }),
      ]);

      // Stage 2: Vegetative
      const stage2 = await this.growthStageRepository.save(
        this.growthStageRepository.create({
          id: 'e0000000-0000-0000-0000-000000000012',
          rule_id: defaultRule.id,
          stage_name: 'Vegetative Growth',
          stage_order: 2,
          animation: 'foliage_lush',
          min_day: 8,
          max_day: 35,
        }),
      );

      await this.growthConditionRepository.save([
        this.growthConditionRepository.create({
          stage_id: stage2.id,
          name: 'Moisture & pH Balance',
          condition_order: 1,
          inputs: ['water', 'ph'],
          rules: [
            {
              input: ['water', 'ph'],
              output: { rule: ['ph > water'], to: 'Soil pH exceeds hydration capacity', statusColor: '#FF9800' },
            },
            {
              input: ['water', 'ph'],
              output: { rule: ['water > ph'], to: 'Excess moisture limits root oxygenation', statusColor: '#FF9800' },
            },
            {
              input: ['water'],
              output: { rule: ['water < 35'], to: 'Foliage wilting due to water stress', statusColor: '#F44336' },
            },
            {
              input: ['water', 'ph'],
              output: { rule: ['otherwise'], to: 'Moisture and pH in harmonious balance', statusColor: '#4CAF50' },
            },
          ],
          outputs: ['over_ph', 'over_water', 'underwatered', 'optimal'],
        }),
        this.growthConditionRepository.create({
          stage_id: stage2.id,
          name: 'Thermal Environment',
          condition_order: 2,
          inputs: ['temperature'],
          rules: [
            {
              input: ['temperature'],
              output: { rule: ['temperature > 35'], to: 'Heat stress triggers stomata closure', statusColor: '#F44336' },
            },
            {
              input: ['temperature'],
              output: { rule: ['temperature < 18'], to: 'Enzyme activity slowed by low temperatures', statusColor: '#FF9800' },
            },
            {
              input: ['temperature'],
              output: { rule: ['otherwise'], to: 'Optimal vegetative temperature', statusColor: '#4CAF50' },
            },
          ],
          outputs: ['too_hot', 'too_cold', 'optimal'],
        }),
        this.growthConditionRepository.create({
          stage_id: stage2.id,
          name: 'Nitrogen & Foliage Nutrients',
          condition_order: 3,
          inputs: ['n', 'p', 'k'],
          rules: [
            {
              input: ['n'],
              output: { rule: ['n < 30'], to: 'Low nitrogen causes leaf chlorosis', statusColor: '#FF9800' },
            },
            {
              input: ['n'],
              output: { rule: ['n > 85'], to: 'High nitrogen concentration burns foliage tips', statusColor: '#F44336' },
            },
            {
              input: ['n', 'p', 'k'],
              output: { rule: ['otherwise'], to: 'Lush chlorophyll synthesis', statusColor: '#4CAF50' },
            },
          ],
          outputs: ['nitrogen_deficient', 'nutrient_burn', 'optimal'],
        }),
        this.growthConditionRepository.create({
          stage_id: stage2.id,
          name: 'Photosynthetic Light Exposure',
          condition_order: 4,
          inputs: ['sunlight', 'temperature'],
          rules: [
            {
              input: ['sunlight'],
              output: { rule: ['sunlight < 5'], to: 'Insufficient light causes weak spindly growth', statusColor: '#FF9800' },
            },
            {
              input: ['sunlight'],
              output: { rule: ['sunlight > 14'], to: 'Sunlight intensity risks leaf scalding', statusColor: '#FFC107' },
            },
            {
              input: ['sunlight', 'temperature'],
              output: { rule: ['otherwise'], to: 'Optimal sunlight for vegetative vigor', statusColor: '#4CAF50' },
            },
          ],
          outputs: ['light_starved', 'excess_light', 'optimal'],
        }),
      ]);

      // Stage 3: Flowering
      const stage3 = await this.growthStageRepository.save(
        this.growthStageRepository.create({
          id: 'e0000000-0000-0000-0000-000000000013',
          rule_id: defaultRule.id,
          stage_name: 'Flowering & Blooming',
          stage_order: 3,
          animation: 'bloom_flower',
          min_day: 36,
          max_day: 55,
        }),
      );

      await this.growthConditionRepository.save([
        this.growthConditionRepository.create({
          stage_id: stage3.id,
          name: 'Bloom Hydration',
          condition_order: 1,
          inputs: ['water'],
          rules: [
            {
              input: ['water'],
              output: { rule: ['water < 40'], to: 'Flower buds dropping due to drought', statusColor: '#F44336' },
            },
            {
              input: ['water'],
              output: { rule: ['water > 85'], to: 'Saturated roots risk blossom rot', statusColor: '#FF9800' },
            },
            {
              input: ['water'],
              output: { rule: ['otherwise'], to: 'Balanced hydration for flower set', statusColor: '#4CAF50' },
            },
          ],
          outputs: ['underwatered', 'over_water', 'optimal'],
        }),
        this.growthConditionRepository.create({
          stage_id: stage3.id,
          name: 'Phosphorus & Potassium Bloom Ratio',
          condition_order: 2,
          inputs: ['p', 'k'],
          rules: [
            {
              input: ['p'],
              output: { rule: ['p < 30'], to: 'Phosphorus deficiency impairs flower formation', statusColor: '#FF9800' },
            },
            {
              input: ['k'],
              output: { rule: ['k < 30'], to: 'Potassium deficiency impairs stem strength', statusColor: '#FF9800' },
            },
            {
              input: ['p', 'k'],
              output: { rule: ['otherwise'], to: 'Rich floral pigmentation and bloom set', statusColor: '#4CAF50' },
            },
          ],
          outputs: ['phosphorus_deficient', 'potassium_deficient', 'optimal'],
        }),
      ]);

      // Stage 4: Harvest
      const stage4 = await this.growthStageRepository.save(
        this.growthStageRepository.create({
          id: 'e0000000-0000-0000-0000-000000000014',
          rule_id: defaultRule.id,
          stage_name: 'Mature & Harvest Ready',
          stage_order: 4,
          animation: 'harvest_ready',
          min_day: 56,
          max_day: 90,
        }),
      );

      await this.growthConditionRepository.save([
        this.growthConditionRepository.create({
          stage_id: stage4.id,
          name: 'Harvest Quality Control',
          condition_order: 1,
          inputs: ['water', 'temperature'],
          rules: [
            {
              input: ['water'],
              output: { rule: ['water > 80'], to: 'Excess water dilutes essential aromatic oils', statusColor: '#FF9800' },
            },
            {
              input: ['temperature'],
              output: { rule: ['temperature > 38'], to: 'Severe heat diminishes herb fragrance', statusColor: '#F44336' },
            },
            {
              input: ['water', 'temperature'],
              output: { rule: ['otherwise'], to: 'Peak potency and culinary quality', statusColor: '#4CAF50' },
            },
          ],
          outputs: ['over_water', 'too_hot', 'optimal'],
        }),
      ]);
    }

    // Link products to default growth rule if unlinked
    await this.productRepository
      .createQueryBuilder()
      .update(Product)
      .set({ rule_id: defaultRule.id })
      .where('rule_id IS NULL')
      .execute();
  }

  async seedData() {
    // 1. Seed Users (ensure Admin exists)
    let admin = await this.userRepository.findOne({ where: { email: 'admin@seedstore.com' } });
    if (!admin) {
      this.logger.log('Creating default Admin user (admin@seedstore.com)...');
      const salt = await bcrypt.genSalt(10);
      const adminPassword = await bcrypt.hash('Admin@123456', salt);

      admin = this.userRepository.create({
        id: 'a0000000-0000-0000-0000-000000000001',
        email: 'admin@seedstore.com',
        password_hash: adminPassword,
        full_name: 'Store Administrator',
        phone: '+66 81 234 5678',
        address: '123 Botanical Garden Ave, Bangkok, Thailand',
        avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
        role: Role.ADMIN,
        is_active: true,
        is_verified: true,
        verified_at: new Date(),
      });
      await this.userRepository.save(admin);
    } else if (!admin.is_verified) {
      admin.is_verified = true;
      admin.verified_at = new Date();
      await this.userRepository.save(admin);
    }

    let customer = await this.userRepository.findOne({ where: { email: 'customer@seedstore.com' } });
    if (!customer) {
      const salt = await bcrypt.genSalt(10);
      const customerPassword = await bcrypt.hash('User@123456', salt);

      customer = this.userRepository.create({
        id: 'a0000000-0000-0000-0000-000000000002',
        email: 'customer@seedstore.com',
        password_hash: customerPassword,
        full_name: 'Somchai Greenery',
        phone: '+66 89 876 5432',
        address: '456 Organic Way, Chiang Mai, Thailand',
        avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
        role: Role.CUSTOMER,
        is_active: true,
        is_verified: true,
        verified_at: new Date(),
      });
      await this.userRepository.save(customer);
    } else if (!customer.is_verified) {
      customer.is_verified = true;
      customer.verified_at = new Date();
      await this.userRepository.save(customer);
    }

    // Seed Sentinel Deleted User Account (for foreign-key preservation on user deletion)
    let sentinelUser = await this.userRepository.findOne({ where: { id: DELETED_USER_ID } });
    if (!sentinelUser) {
      sentinelUser = this.userRepository.create({
        id: DELETED_USER_ID,
        email: DELETED_USER_EMAIL,
        password_hash: 'unusable-no-login',
        full_name: DELETED_USER_NAME,
        phone: undefined,
        address: undefined,
        avatar_url: undefined,
        role: Role.SYSTEM,
        is_active: false,
        is_verified: true,
        verified_at: new Date(),
      });
      await this.userRepository.save(sentinelUser);
    }

    const categoryCount = await this.categoryRepository.count();
    if (categoryCount > 0) {
      return;
    }

    // 2. Seed Categories
    const categoriesData = [
      {
        id: 'c0000000-0000-0000-0000-000000000001',
        name: 'Culinary Herbs',
        slug: 'culinary-herbs',
        description: 'Fresh, aromatic herbs for daily kitchen cooking and seasonings.',
        icon: 'local_florist',
      },
      {
        id: 'c0000000-0000-0000-0000-000000000002',
        name: 'Vegetable Seeds',
        slug: 'vegetable-seeds',
        description: 'Nutritious organic vegetable seeds for home garden harvests.',
        icon: 'eco',
      },
      {
        id: 'c0000000-0000-0000-0000-000000000003',
        name: 'Medicinal & Tea Herbs',
        slug: 'medicinal-herbs',
        description: 'Healing botanicals, relaxing teas, and traditional wellness herbs.',
        icon: 'spa',
      },
      {
        id: 'c0000000-0000-0000-0000-000000000004',
        name: 'Microgreens & Sprouting',
        slug: 'microgreens',
        description: 'Fast-growing, nutrient-dense microgreens ready in 7-14 days.',
        icon: 'grass',
      },
      {
        id: 'c0000000-0000-0000-0000-000000000005',
        name: 'Edible Flowers',
        slug: 'edible-flowers',
        description: 'Beautiful, vibrant flowers that elevate salads and beverages.',
        icon: 'yard',
      },
    ];

    for (const cat of categoriesData) {
      await this.categoryRepository.save(this.categoryRepository.create(cat));
    }

    // 3. Seed Products
    const productsData = [
      {
        id: 'b0000000-0000-0000-0000-000000000001',
        category_id: 'c0000000-0000-0000-0000-000000000001',
        name: 'Thai Holy Basil (Krapow)',
        scientific_name: 'Ocimum tenuiflorum',
        description: 'Essential Thai culinary herb with spicy peppery aroma. Fast growing and loves tropical sunshine.',
        detailed_description: 'Thai Holy Basil (also known as Tulsi or Bai Krapow) is a revered botanical variety renowned for its pungent, clove-and-anise spice profile. It serves as the quintessential star ingredient in authentic Pad Krapow stir-fries.\n\nThis cultivar flourishes in full sun and well-aerated potting loam. Germination typically begins within 5 to 7 days when kept moist at temperatures between 24°C and 32°C.\n\nPruning the central terminal flower buds encourages dense lateral branching, yielding lush clusters of aromatic dark-green and purplish leaves throughout an extended harvest window.',
        price: 4.50,
        stock: 150,
        image_url: 'https://images.unsplash.com/photo-1618164436241-4473940d1f5c?auto=format&fit=crop&w=600&q=80',
        images: [
          'https://images.unsplash.com/photo-1618164436241-4473940d1f5c?auto=format&fit=crop&w=600&q=80',
          'https://images.unsplash.com/photo-1608686207856-001b95cf60ca?auto=format&fit=crop&w=600&q=80',
          'https://images.unsplash.com/photo-1592841200221-a6898f307baa?auto=format&fit=crop&w=600&q=80',
        ],
        difficulty: 'Easy',
        germination_days: 5,
        harvest_days: 45,
      },
      {
        id: 'b0000000-0000-0000-0000-000000000002',
        category_id: 'c0000000-0000-0000-0000-000000000001',
        name: 'Sweet Italian Genovese Basil',
        scientific_name: 'Ocimum basilicum',
        description: 'Classic large-leaf Italian basil with sweet aroma. Perfect for pesto, pasta, and caprese salads.',
        detailed_description: 'Genovese Basil is the classic heirloom Italian variety celebrated across Mediterranean gastronomy for its delicate sweetness, tender texture, and glossy emerald leaves.\n\nIdeal for windowsill planters and kitchen garden beds. Harvest regular leaf sets just above nodes to sustain robust vegetative vigour and prevent premature flowering.',
        price: 4.00,
        stock: 120,
        image_url: 'https://images.unsplash.com/photo-1608686207856-001b95cf60ca?auto=format&fit=crop&w=600&q=80',
        images: [
          'https://images.unsplash.com/photo-1608686207856-001b95cf60ca?auto=format&fit=crop&w=600&q=80',
          'https://images.unsplash.com/photo-1618164436241-4473940d1f5c?auto=format&fit=crop&w=600&q=80',
        ],
        difficulty: 'Easy',
        germination_days: 6,
        harvest_days: 50,
      },
      {
        id: 'b0000000-0000-0000-0000-000000000003',
        category_id: 'c0000000-0000-0000-0000-000000000001',
        name: 'Spearmint & Peppermint Mix',
        scientific_name: 'Mentha spicata',
        description: 'Vigorous refreshing mint variety. Thrives in moist soil and partial sunlight. Great for drinks and teas.',
        detailed_description: 'An invigorating perennial combination of fragrant spearmint and intense peppermint botanicals.\n\nProvides a continuous stream of crisp, menthol-rich leaves optimal for infused sparkling beverages, desserts, and soothing herbal teas.',
        price: 5.00,
        stock: 85,
        image_url: 'https://images.unsplash.com/photo-1628556270448-4d4e4148e1b1?auto=format&fit=crop&w=600&q=80',
        images: [
          'https://images.unsplash.com/photo-1628556270448-4d4e4148e1b1?auto=format&fit=crop&w=600&q=80',
        ],
        difficulty: 'Easy',
        germination_days: 10,
        harvest_days: 40,
      },
      {
        id: 'b0000000-0000-0000-0000-000000000006',
        category_id: 'c0000000-0000-0000-0000-000000000002',
        name: 'Sweet Cherry Tomato (Red Robin)',
        scientific_name: 'Solanum lycopersicum',
        description: 'Dwarf patio cherry tomato yielding clusters of ultra-sweet bite-sized fruits.',
        detailed_description: 'Red Robin is a dwarf determinate patio variety that produces abundant cascades of bright scarlet cherry tomatoes.\n\nWell suited for compact urban spaces, balcony containers, and indoor grow lights. Requires minimal staking while delivering high brix sweetness.',
        price: 5.50,
        stock: 90,
        image_url: 'https://images.unsplash.com/photo-1592841200221-a6898f307baa?auto=format&fit=crop&w=600&q=80',
        images: [
          'https://images.unsplash.com/photo-1592841200221-a6898f307baa?auto=format&fit=crop&w=600&q=80',
        ],
        difficulty: 'Moderate',
        germination_days: 7,
        harvest_days: 65,
      },
      {
        id: 'b0000000-0000-0000-0000-000000000007',
        category_id: 'c0000000-0000-0000-0000-000000000002',
        name: "Bird's Eye Chili (Prik Kee Noo)",
        scientific_name: 'Capsicum frutescens',
        description: 'Fiery hot Thai chili pepper. Prolific producer in tropical heat.',
        price: 4.50,
        stock: 110,
        image_url: 'https://images.unsplash.com/photo-1588252303782-cb80119abd6d?auto=format&fit=crop&w=600&q=80',
        difficulty: 'Easy',
        germination_days: 10,
        harvest_days: 75,
      },
      {
        id: 'b0000000-0000-0000-0000-000000000008',
        category_id: 'c0000000-0000-0000-0000-000000000002',
        name: 'Crispy Romaine Lettuce',
        scientific_name: 'Lactuca sativa',
        description: 'Upright crunchy sweet leaves. Fast growing cool season vegetable.',
        price: 3.80,
        stock: 140,
        image_url: 'https://images.unsplash.com/photo-1556801712-76c8eb07bbc9?auto=format&fit=crop&w=600&q=80',
        difficulty: 'Easy',
        germination_days: 4,
        harvest_days: 45,
      },
      {
        id: 'b0000000-0000-0000-0000-000000000009',
        category_id: 'c0000000-0000-0000-0000-000000000003',
        name: 'German Chamomile',
        scientific_name: 'Matricaria chamomilla',
        description: 'Soothing daisy-like flowers used for calming teas and relaxation.',
        price: 5.00,
        stock: 75,
        image_url: 'https://images.unsplash.com/photo-1516205651411-aef33a44f7c2?auto=format&fit=crop&w=600&q=80',
        difficulty: 'Moderate',
        germination_days: 10,
        harvest_days: 60,
      },
      {
        id: 'b0000000-0000-0000-0000-000000000010',
        category_id: 'c0000000-0000-0000-0000-000000000003',
        name: 'Butterfly Pea (Dok Anchan)',
        scientific_name: 'Clitoria ternatea',
        description: 'Deep blue flowers rich in antioxidants. Changes color to purple with lemon.',
        price: 4.80,
        stock: 80,
        image_url: 'https://images.unsplash.com/photo-1560717789-0ac7c58ac90a?auto=format&fit=crop&w=600&q=80',
        difficulty: 'Easy',
        germination_days: 7,
        harvest_days: 55,
      },
    ];

    for (const p of productsData) {
      const product = this.productRepository.create(p);
      await this.productRepository.save(product);
    }

    // 4. Seed Sample Reviews
    const reviewsData = [
      {
        product_id: 'b0000000-0000-0000-0000-000000000001',
        user_id: customer.id,
        rating: 5,
        comment: 'Sprouted in only 4 days! The aroma is incredibly authentic and strong. Best holy basil seeds I have purchased.',
      },
      {
        product_id: 'b0000000-0000-0000-0000-000000000002',
        user_id: customer.id,
        rating: 5,
        comment: 'Classic sweet aroma and beautiful green foliage. Great results!',
      },
      {
        product_id: 'b0000000-0000-0000-0000-000000000006',
        user_id: customer.id,
        rating: 4,
        comment: 'Very sweet cherry tomatoes. Got huge yields on my patio container.',
      },
    ];

    for (const rev of reviewsData) {
      await this.reviewRepository.save(this.reviewRepository.create(rev));
    }

    // 5. Seed Sample Completed Order
    const sampleOrder = this.orderRepository.create({
      id: 'd0000000-0000-0000-0000-000000000001',
      user_id: customer.id,
      order_number: 'ORD-2026-9812',
      total_amount: 14.00,
      status: OrderStatus.PAID_CONFIRMED,
      shipping_name: 'Somchai Greenery',
      shipping_address: '456 Organic Way, Chiang Mai, Thailand',
      shipping_phone: '+66 89 876 5432',
      notes: 'Please leave at security gate.',
    });
    const savedOrder = await this.orderRepository.save(sampleOrder);

    const sampleItems = [
      {
        order_id: savedOrder.id,
        product_id: 'b0000000-0000-0000-0000-000000000001',
        product_name: 'Thai Holy Basil (Krapow)',
        quantity: 2,
        unit_price: 4.50,
        subtotal: 9.00,
      },
      {
        order_id: savedOrder.id,
        product_id: 'b0000000-0000-0000-0000-000000000003',
        product_name: 'Spearmint & Peppermint Mix',
        quantity: 1,
        unit_price: 5.00,
        subtotal: 5.00,
      },
    ];

    for (const item of sampleItems) {
      await this.orderItemRepository.save(this.orderItemRepository.create(item));
    }

    const samplePayment = this.paymentRepository.create({
      order_id: savedOrder.id,
      payment_method: 'PROMPTPAY_QR',
      amount: 14.00,
      slip_image_url: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=400&q=80',
      status: PaymentStatus.VERIFIED,
      verified_at: new Date(),
      verified_by: admin.id,
      notes: 'Verified against PromptPay reference 98123400.',
    });
    await this.paymentRepository.save(samplePayment);

    this.logger.log('Seed data successfully populated with Admin, Customer, Categories, Products, and Orders!');
  }
}
