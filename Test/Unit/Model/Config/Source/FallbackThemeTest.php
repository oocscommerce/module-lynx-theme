<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Test\Unit\Model\Config\Source;

use Magento\Theme\Model\ResourceModel\Theme\Collection;
use Magento\Theme\Model\ResourceModel\Theme\CollectionFactory;
use Magento\Theme\Model\Theme;
use OOCS\LynxComponent\Helper\ThemeIdentity;
use OOCS\LynxTheme\Model\Config\Source\FallbackTheme;
use PHPUnit\Framework\TestCase;

/**
 * The fallback theme choices: storefront themes without Lynx and its children
 */
class FallbackThemeTest extends TestCase
{
    /**
     * Lynx and a child of it are left out, Magento themes stay, after the empty choice
     *
     * @return void
     */
    public function testLeavesLynxOut(): void
    {
        $themes = [$this->theme(1, 'Magento Blank'), $this->theme(6, 'Lynx Blank'), $this->theme(9, 'Shop Theme')];
        $collection = $this->createMock(Collection::class);
        $collection->method('addAreaFilter')->with('frontend')->willReturnSelf();
        $collection->method('getIterator')->willReturn(new \ArrayIterator($themes));
        $factory = $this->createMock(CollectionFactory::class);
        $factory->method('create')->willReturn($collection);
        $identity = $this->createMock(ThemeIdentity::class);
        $identity->method('isLynx')->willReturnCallback(fn (Theme $theme) => $theme->getId() === 6);

        $options = (new FallbackTheme($factory, $identity))->toOptionArray();

        $this->assertSame(['', '1', '9'], array_column($options, 'value'));
        $this->assertSame(['Magento Blank', 'Shop Theme'], \array_slice(array_column($options, 'label'), 1));
    }

    /**
     * A theme with this id and title
     *
     * @param int $id
     * @param string $title
     * @return Theme
     */
    private function theme(int $id, string $title): Theme
    {
        $theme = $this->getMockBuilder(Theme::class)->disableOriginalConstructor()->onlyMethods(['getId'])->getMock();
        $theme->method('getId')->willReturn($id);
        $theme->setData('theme_title', $title);

        return $theme;
    }
}
