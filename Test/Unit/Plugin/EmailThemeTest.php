<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Test\Unit\Plugin;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\View\Design\Theme\ThemeProviderInterface;
use Magento\Framework\View\Design\ThemeInterface;
use Magento\Framework\View\DesignInterface;
use OOCS\LynxComponent\Helper\ThemeIdentity;
use OOCS\LynxTheme\Helper\EmailDesign;
use OOCS\LynxTheme\Plugin\EmailTheme;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

/**
 * A Lynx store's theme turns into the email theme only while an email renders, and only into a theme that loads
 */
class EmailThemeTest extends TestCase
{
    /**
     * @var EmailDesign
     */
    private EmailDesign $emailDesign;

    /**
     * @var ScopeConfigInterface&MockObject
     */
    private ScopeConfigInterface $scopeConfig;

    /**
     * @var ThemeProviderInterface&MockObject
     */
    private ThemeProviderInterface $themeProvider;

    /**
     * @var EmailTheme
     */
    private EmailTheme $plugin;

    /**
     * Store 1 runs Lynx (theme 7), store 2 does not; Luma is theme 3, a Lynx child 9
     *
     * @return void
     */
    protected function setUp(): void
    {
        $this->emailDesign = new EmailDesign();
        $this->scopeConfig = $this->createMock(ScopeConfigInterface::class);
        $this->themeProvider = $this->createMock(ThemeProviderInterface::class);
        $this->themeProvider->method('getThemeById')->willReturnCallback(fn ($id) => $this->theme((int) $id));
        $identity = $this->createMock(ThemeIdentity::class);
        $identity->method('isLynxForStore')->willReturnCallback(fn (int $storeId) => $storeId === 1);
        $identity->method('isLynx')->willReturnCallback(fn (ThemeInterface $theme) => $theme->getId() === 9);

        $this->plugin = new EmailTheme($this->emailDesign, $identity, $this->scopeConfig, $this->themeProvider);
    }

    /**
     * A theme with this id; 0 stands for one that does not load
     *
     * @param int $id
     * @return ThemeInterface
     */
    private function theme(int $id): ThemeInterface
    {
        $theme = $this->createMock(ThemeInterface::class);
        $theme->method('getId')->willReturn($id ?: null);

        return $theme;
    }

    /**
     * The store's theme for the frontend while an email of store $storeId renders
     *
     * @param int $storeId
     * @return string|null
     */
    private function emailThemeOf(int $storeId): ?string
    {
        $this->emailDesign->enter();
        $result = $this->plugin->afterGetConfigurationDesignTheme(
            $this->createMock(DesignInterface::class),
            '7',
            'frontend',
            ['store' => $storeId]
        );
        $this->emailDesign->leave();

        return $result;
    }

    /**
     * Nothing set: the store's own
     *
     * @return void
     */
    public function testNothingSetLeavesStoreTheme(): void
    {
        $this->assertSame('7', $this->emailThemeOf(1));
    }

    /**
     * The store's pick wins; a Lynx pick or a theme gone from disk leaves the store's own
     *
     * @return void
     */
    public function testConfiguredTheme(): void
    {
        $this->scopeConfig->method('getValue')->willReturnOnConsecutiveCalls('3', '9', '0');

        $this->assertSame('3', $this->emailThemeOf(1));
        $this->assertSame('7', $this->emailThemeOf(1));
        $this->assertSame('7', $this->emailThemeOf(1));
    }

    /**
     * Outside an email, for a store not on Lynx, without a store, or for another area: untouched
     *
     * @return void
     */
    public function testLeavesOtherQuestionsAlone(): void
    {
        $design = $this->createMock(DesignInterface::class);
        $ask = fn (string $area, array $params) => $this->plugin->afterGetConfigurationDesignTheme(
            $design,
            '7',
            $area,
            $params
        );

        $this->assertSame('7', $ask('frontend', ['store' => 1]));
        $this->assertSame('7', $this->emailThemeOf(2));
        $this->emailDesign->enter();
        $this->assertSame('7', $ask('frontend', []));
        $this->assertSame('7', $ask('adminhtml', ['store' => 1]));
        $this->emailDesign->leave();
    }
}
